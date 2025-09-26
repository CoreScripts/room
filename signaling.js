class GitHubSignaling {
    constructor() {
        this.baseURL = 'https://api.github.com';
        this.token = localStorage.getItem('github_chat_token');
        this.registryGistId = 'chatroom_registry'; // Fixed ID for room discovery
        this.messageInterval = 2000; // Check every 2 seconds
    }

    // 🔄 NEW: Get all rooms from all devices
    async getAllRooms() {
        const rooms = new Map();

        // 1. Get local rooms
        const localRooms = JSON.parse(localStorage.getItem('chat_rooms') || '{}');
        Object.entries(localRooms).forEach(([name, room]) => {
            rooms.set(name, room);
        });

        // 2. Get GitHub rooms if token available
        if (this.token) {
            const githubRooms = await this.getGitHubRooms();
            githubRooms.forEach(([name, room]) => {
                if (!rooms.has(name)) {
                    rooms.set(name, room);
                }
            });
        }

        return rooms;
    }

    // 🔄 NEW: Register room globally so others can find it
    async registerRoom(roomName, password = null) {
        const roomData = {
            name: roomName,
            password: password,
            created: Date.now(),
            creator: this.getUsername(),
            users: 1
        };

        // Store locally
        const localRooms = JSON.parse(localStorage.getItem('chat_rooms') || '{}');
        localRooms[roomName] = roomData;
        localStorage.setItem('chat_rooms', JSON.stringify(localRooms));

        // Register on GitHub for cross-device discovery
        if (this.token) {
            await this.updateRoomRegistry(roomName, roomData);
        }
    }

    // 🔄 NEW: Central room registry on GitHub
    async updateRoomRegistry(roomName, roomData) {
        try {
            // Try to get existing registry
            let registry = {};
            
            // This would need a fixed gist ID that all clients use
            // For simplicity, we'll use a predictable gist name
            const gistId = await this.getOrCreateRegistryGist();
            
            if (gistId) {
                const response = await fetch(`${this.baseURL}/gists/${gistId}`, {
                    headers: {
                        'Authorization': `token ${this.token}`
                    }
                });
                
                if (response.ok) {
                    const gist = await response.json();
                    registry = JSON.parse(gist.files['registry.json'].content || '{}');
                }
            }

            // Update registry
            registry[roomName] = {
                ...roomData,
                lastUpdated: Date.now()
            };

            // Remove old rooms (older than 1 hour)
            const oneHourAgo = Date.now() - 3600000;
            Object.keys(registry).forEach(room => {
                if (registry[room].lastUpdated < oneHourAgo) {
                    delete registry[room];
                }
            });

            // Save back to gist
            await this.saveRegistry(registry, gistId);
            
        } catch (error) {
            console.log('GitHub registry unavailable, using local only');
        }
    }

    // 🔄 NEW: Get rooms from GitHub registry
    async getGitHubRooms() {
        if (!this.token) return new Map();

        try {
            const gistId = await this.getRegistryGistId();
            if (!gistId) return new Map();

            const response = await fetch(`${this.baseURL}/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });

            if (response.ok) {
                const gist = await response.json();
                const registry = JSON.parse(gist.files['registry.json'].content || '{}');
                return new Map(Object.entries(registry));
            }
        } catch (error) {
            console.log('Failed to fetch GitHub rooms');
        }

        return new Map();
    }

    // 🔄 NEW: Automatic room list refreshing
    startRoomDiscovery(callback) {
        let lastRegistryCheck = 0;

        setInterval(async () => {
            try {
                const rooms = await this.getAllRooms();
                callback(rooms);
                
                // Update GitHub registry less frequently
                if (Date.now() - lastRegistryCheck > 30000) { // Every 30 seconds
                    await this.cleanupRegistry();
                    lastRegistryCheck = Date.now();
                }
            } catch (error) {
                console.log('Room discovery error:', error);
            }
        }, 5000); // Check every 5 seconds
    }

    // 🔄 NEW: Remove inactive rooms
    async cleanupRegistry() {
        if (!this.token) return;

        try {
            const gistId = await this.getRegistryGistId();
            if (!gistId) return;

            const response = await fetch(`${this.baseURL}/gists/${gistId}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });

            if (response.ok) {
                const gist = await response.json();
                const registry = JSON.parse(gist.files['registry.json'].content || '{}');
                
                const oneHourAgo = Date.now() - 3600000;
                let changed = false;

                Object.keys(registry).forEach(room => {
                    if (registry[room].lastUpdated < oneHourAgo) {
                        delete registry[room];
                        changed = true;
                    }
                });

                if (changed) {
                    await this.saveRegistry(registry, gistId);
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    // 🔄 FIXED: Enhanced message sending with room registration
    async sendMessage(type, data, roomName) {
        const message = {
            type,
            data,
            timestamp: Date.now(),
            id: Math.random().toString(36).substr(2, 9),
            room: roomName
        };

        // Always store locally
        this.storeLocalMessage(message, roomName);

        // Register room when first message is sent
        if (type === 'chat_message') {
            await this.registerRoom(roomName, data.password);
        }

        // Send to GitHub if available
        if (this.token) {
            await this.sendToGitHub(message, roomName);
        }
    }

    // ... rest of the existing methods ...
}
