class GitHubSignaling {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.token = localStorage.getItem('github_chat_token');
        this.gistId = localStorage.getItem('github_chat_gist');
        this.messageInterval = 3000; // Check every 3 seconds
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('github_chat_token', token);
    }

    async createSignalingGist(roomName) {
        if (!this.token) return null;

        const gistData = {
            description: `Chatroom Signaling - ${roomName}`,
            public: false,
            files: {
                'signaling.json': {
                    content: JSON.stringify({
                        room: roomName,
                        created: Date.now(),
                        messages: [],
                        users: []
                    })
                }
            }
        };

        try {
            const response = await fetch(`${this.baseURL}/gists`, {
                method: 'POST',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(gistData)
            });

            const gist = await response.json();
            this.gistId = gist.id;
            localStorage.setItem('github_chat_gist', gist.id);
            return gist.id;
        } catch (error) {
            console.error('Failed to create signaling gist:', error);
            return null;
        }
    }

    async sendMessage(type, data, roomName) {
        const message = {
            type,
            data,
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9)
        };

        // Store in localStorage for same-device communication
        this.storeLocalMessage(message, roomName);

        // Send to GitHub if token available
        if (this.token && this.gistId) {
            await this.updateGist(message, roomName);
        }
    }

    storeLocalMessage(message, roomName) {
        const key = `chat_${roomName}_messages`;
        const messages = JSON.parse(localStorage.getItem(key) || '[]');
        messages.push(message);
        localStorage.setItem(key, JSON.stringify(messages.slice(-100))); // Keep last 100 messages
    }

    async updateGist(message, roomName) {
        if (!this.gistId || !this.token) return;

        try {
            // Get current gist
            const response = await fetch(`${this.baseURL}/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });

            const gist = await response.json();
            const content = JSON.parse(gist.files['signaling.json'].content);
            
            // Add message
            content.messages.push(message);
            content.messages = content.messages.slice(-50); // Keep last 50 messages

            // Update gist
            await fetch(`${this.baseURL}/gists/${this.gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    files: {
                        'signaling.json': {
                            content: JSON.stringify(content)
                        }
                    }
                })
            });
        } catch (error) {
            console.error('Failed to update gist:', error);
        }
    }

    async getMessages(roomName, lastCheck = 0) {
        const messages = [];

        // Get local messages
        const localKey = `chat_${roomName}_messages`;
        const localMessages = JSON.parse(localStorage.getItem(localKey) || '[]');
        messages.push(...localMessages.filter(m => m.timestamp > lastCheck));

        // Get GitHub messages if available
        if (this.token && this.gistId) {
            const githubMessages = await this.getGistMessages();
            messages.push(...githubMessages.filter(m => m.timestamp > lastCheck));
        }

        // Remove duplicates and sort
        const uniqueMessages = this.removeDuplicates(messages);
        return uniqueMessages.sort((a, b) => a.timestamp - b.timestamp);
    }

    async getGistMessages() {
        if (!this.gistId || !this.token) return [];

        try {
            const response = await fetch(`${this.baseURL}/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });

            const gist = await response.json();
            const content = JSON.parse(gist.files['signaling.json'].content);
            return content.messages || [];
        } catch (error) {
            console.error('Failed to get gist messages:', error);
            return [];
        }
    }

    removeDuplicates(messages) {
        const seen = new Set();
        return messages.filter(message => {
            const id = message.id || `${message.type}_${message.timestamp}`;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    startMessagePolling(roomName, callback) {
        let lastCheck = Date.now() - 1000; // Check messages from 1 second ago

        setInterval(async () => {
            const newMessages = await this.getMessages(roomName, lastCheck);
            if (newMessages.length > 0) {
                lastCheck = Math.max(...newMessages.map(m => m.timestamp));
                newMessages.forEach(callback);
            }
        }, this.messageInterval);
    }
}
