class Chatroom {
    constructor() {
        this.state = {
            currentRoom: null,
            username: 'User_' + Math.floor(Math.random() * 10000),
            rooms: new Map(),
            isInRoom: false
        };

        this.signaling = new GitHubSignaling();
        this.init();
    }

    init() {
        this.bindEvents();
        this.showLobby();
        this.loadUsername();
        
        // Check for GitHub token
        if (this.signaling.token) {
            console.log('GitHub token loaded');
        }
    }

    bindEvents() {
        // Lobby events
        document.getElementById('createRoom').addEventListener('click', () => this.createRoom());
        document.getElementById('changeUsername').addEventListener('click', () => this.changeUsername());
        document.getElementById('saveToken').addEventListener('click', () => this.saveGitHubToken());

        // Room events
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        document.getElementById('leaveRoom').addEventListener('click', () => this.leaveRoom());
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Enter key for room creation
        document.getElementById('roomName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });
    }

    showLobby() {
        this.state.isInRoom = false;
        this.state.currentRoom = null;
        
        document.getElementById('lobby').classList.add('active');
        document.getElementById('room').classList.remove('active');
        
        this.updateRoomsList();
        this.startRoomPolling();
    }

    showRoom(roomName) {
        this.state.isInRoom = true;
        this.state.currentRoom = roomName;
        
        document.getElementById('lobby').classList.remove('active');
        document.getElementById('room').classList.add('active');
        
        document.getElementById('roomTitle').textContent = `💬 ${roomName}`;
        document.getElementById('chatMessages').innerHTML = '<div class="message system">Welcome to the room!</div>';

        // Start listening for messages
        this.signaling.startMessagePolling(roomName, (message) => this.handleMessage(message));

        // Notify others
        this.signaling.sendMessage('user_joined', {
            username: this.state.username,
            room: roomName
        }, roomName);
    }

    async createRoom() {
        const roomName = document.getElementById('roomName').value.trim();
        const password = document.getElementById('roomPassword').value.trim();

        if (!roomName) {
            alert('Please enter a room name');
            return;
        }

        if (this.state.rooms.has(roomName)) {
            alert('Room already exists');
            return;
        }

        // Create room
        const room = {
            name: roomName,
            password: password || null,
            users: new Set([this.state.username]),
            messages: []
        };

        this.state.rooms.set(roomName, room);

        // Create GitHub gist for signaling if token available
        if (this.signaling.token) {
            await this.signaling.createSignalingGist(roomName);
        }

        this.showRoom(roomName);
        
        // Clear inputs
        document.getElementById('roomName').value = '';
        document.getElementById('roomPassword').value = '';
    }

    joinRoom(roomName, password = '') {
        let room = this.state.rooms.get(roomName);
        
        if (!room) {
            // Room doesn't exist locally, create it
            room = {
                name: roomName,
                password: null,
                users: new Set(),
                messages: []
            };
            this.state.rooms.set(roomName, room);
        }

        if (room.password && room.password !== password) {
            alert('Wrong password!');
            return;
        }

        room.users.add(this.state.username);
        this.showRoom(roomName);
    }

    leaveRoom() {
        if (this.state.currentRoom) {
            this.signaling.sendMessage('user_left', {
                username: this.state.username,
                room: this.state.currentRoom
            }, this.state.currentRoom);
        }
        
        this.showLobby();
    }

    sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text || !this.state.currentRoom) return;

        const messageData = {
            username: this.state.username,
            text: text,
            timestamp: Date.now()
        };

        this.signaling.sendMessage('chat_message', messageData, this.state.currentRoom);
        this.displayMessage(messageData, true);
        
        input.value = '';
        input.focus();
    }

    displayMessage(messageData, isOwn = false) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-user">${isOwn ? 'You' : this.escapeHtml(messageData.username)}</span>
                <span class="message-time">${new Date(messageData.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="message-text">${this.escapeHtml(messageData.text)}</div>
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    handleMessage(message) {
        switch (message.type) {
            case 'chat_message':
                this.displayMessage(message.data);
                break;
                
            case 'user_joined':
                this.addSystemMessage(`🟢 ${message.data.username} joined the room`);
                this.updateUserCount();
                break;
                
            case 'user_left':
                this.addSystemMessage(`🔴 ${message.data.username} left the room`);
                this.updateUserCount();
                break;
        }
    }

    addSystemMessage(text) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system';
        messageDiv.textContent = text;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    updateUserCount() {
        const room = this.state.rooms.get(this.state.currentRoom);
        if (room) {
            document.getElementById('userCount').textContent = `${room.users.size} users`;
        }
    }

    updateRoomsList() {
        const roomsList = document.getElementById('roomsList');
        
        if (this.state.rooms.size === 0) {
            roomsList.innerHTML = '<div class="loading">No rooms available. Create one!</div>';
            return;
        }

        roomsList.innerHTML = '';
        this.state.rooms.forEach((room, roomName) => {
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            roomDiv.innerHTML = `
                <div class="room-name">${this.escapeHtml(roomName)}</div>
                <div class="room-meta">
                    👥 ${room.users.size} users • 
                    ${room.password ? '🔒 Password protected' : '🔓 Open to join'}
                </div>
            `;
            
            roomDiv.addEventListener('click', () => {
                if (room.password) {
                    const password = prompt('Enter room password:');
                    if (password !== room.password) {
                        alert('Wrong password!');
                        return;
                    }
                }
                this.joinRoom(roomName, room.password);
            });
            
            roomsList.appendChild(roomDiv);
        });
    }

    startRoomPolling() {
        // Periodically check for room updates
        setInterval(() => {
            this.updateRoomsList();
        }, 5000);
    }

    changeUsername() {
        const newUsername = prompt('Enter new username:', this.state.username);
        if (newUsername && newUsername.trim()) {
            this.state.username = newUsername.trim();
            document.getElementById('usernameDisplay').textContent = this.state.username;
            localStorage.setItem('chat_username', this.state.username);
        }
    }

    saveGitHubToken() {
        const token = document.getElementById('githubToken').value.trim();
        if (token) {
            this.signaling.setToken(token);
            alert('GitHub token saved! Cross-device chat enabled.');
            document.getElementById('githubToken').value = '';
        }
    }

    loadUsername() {
        const saved = localStorage.getItem('chat_username');
        if (saved) {
            this.state.username = saved;
        }
        document.getElementById('usernameDisplay').textContent = this.state.username;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize chatroom when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.chatroom = new Chatroom();
});
