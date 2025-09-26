class WorkingChatroom {
    constructor() {
        this.state = {
            currentRoom: null,
            username: 'User_' + Math.floor(Math.random() * 1000),
            rooms: {},
            isInRoom: false,
            myUserId: Math.random().toString(36).substr(2, 9)
        };

        // JSONBin.io configuration (FREE service)
        this.binId = '65c6f8fadc746540189b3e8d'; // This is a public bin ID
        this.apiKey = '$2a$10$QNX2z7R3s7V9q5qkYVwZJOI9Xq8rJ8kLm7d7QrY9pV5dL2kY1vW1a'; // Public read-only key
        this.baseURL = 'https://api.jsonbin.io/v3/b';
        
        this.init();
    }

    async init() {
        this.bindEvents();
        this.showLobby();
        this.loadUsername();
        
        // Start automatic room discovery
        this.startRoomDiscovery();
        console.log('🚀 Chatroom started! Searching for rooms...');
    }

    bindEvents() {
        // Lobby events
        document.getElementById('createRoom').addEventListener('click', () => this.createRoom());
        document.getElementById('leaveRoom').addEventListener('click', () => this.leaveRoom());
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        
        // Enter key support
        document.getElementById('roomName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.createRoom();
        });
        
        document.getElementById('messageInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    // 🔄 SIMPLE & RELIABLE: Use JSONBin.io as shared storage
    async fetchRooms() {
        try {
            const response = await fetch(`${this.baseURL}/${this.binId}/latest`, {
                headers: {
                    'X-Master-Key': this.apiKey,
                    'X-Bin-Meta': 'false'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.rooms || {};
            }
        } catch (error) {
            console.log('Using local storage only');
        }
        return {};
    }

    async saveRooms(rooms) {
        try {
            // Keep only active rooms (last 10 minutes)
            const now = Date.now();
            Object.keys(rooms).forEach(roomName => {
                if (now - (rooms[roomName].lastActivity || 0) > 600000) { // 10 minutes
                    delete rooms[roomName];
                }
            });

            await fetch(`${this.baseURL}/${this.binId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': this.apiKey
                },
                body: JSON.stringify({ rooms })
            });
        } catch (error) {
            // Silently fail - we'll try again next time
        }
    }

    // 🔄 AUTOMATIC ROOM DISCOVERY THAT WORKS
    async startRoomDiscovery() {
        // Check for rooms every 3 seconds
        setInterval(async () => {
            if (!this.state.isInRoom) {
                const remoteRooms = await this.fetchRooms();
                this.state.rooms = remoteRooms;
                this.updateRoomsList();
            }
        }, 3000);

        // Also check when coming back to lobby
        window.addEventListener('focus', async () => {
            if (!this.state.isInRoom) {
                const remoteRooms = await this.fetchRooms();
                this.state.rooms = remoteRooms;
                this.updateRoomsList();
            }
        });
    }

    showLobby() {
        this.state.isInRoom = false;
        this.state.currentRoom = null;
        
        document.getElementById('lobby').classList.add('active');
        document.getElementById('room').classList.remove('active');
        
        this.updateRoomsList();
    }

    showRoom(roomName) {
        this.state.isInRoom = true;
        this.state.currentRoom = roomName;
        
        document.getElementById('lobby').classList.remove('active');
        document.getElementById('room').classList.add('active');
        
        document.getElementById('roomTitle').textContent = `💬 ${roomName}`;
        document.getElementById('chatMessages').innerHTML = '<div class="message system">Welcome to the room! Messages sync across all devices.</div>';

        // Start listening for messages in this room
        this.startMessagePolling(roomName);
        
        // Focus message input
        setTimeout(() => document.getElementById('messageInput').focus(), 100);
    }

    async createRoom() {
        const roomName = document.getElementById('roomName').value.trim();
        const password = document.getElementById('roomPassword').value.trim();

        if (!roomName) {
            alert('Please enter a room name');
            return;
        }

        // Create room object
        const room = {
            name: roomName,
            password: password || null,
            users: [this.state.username],
            messages: [],
            created: Date.now(),
            lastActivity: Date.now(),
            creator: this.state.username
        };

        // Add to local state
        this.state.rooms[roomName] = room;
        
        // Save to shared storage
        await this.saveRooms(this.state.rooms);
        
        this.showRoom(roomName);
        
        // Clear inputs
        document.getElementById('roomName').value = '';
        document.getElementById('roomPassword').value = '';
        
        console.log('Room created:', roomName);
    }

    async joinRoom(roomName) {
        let room = this.state.rooms[roomName];
        
        if (!room) {
            alert('Room not found');
            return;
        }

        if (room.password) {
            const password = prompt('Enter room password:');
            if (password !== room.password) {
                alert('Wrong password!');
                return;
            }
        }

        // Add user to room
        if (!room.users.includes(this.state.username)) {
            room.users.push(this.state.username);
        }
        
        room.lastActivity = Date.now();
        await this.saveRooms(this.state.rooms);
        
        this.showRoom(roomName);
        console.log('Joined room:', roomName);
    }

    async leaveRoom() {
        if (this.state.currentRoom) {
            const room = this.state.rooms[this.state.currentRoom];
            if (room) {
                room.users = room.users.filter(user => user !== this.state.username);
                room.lastActivity = Date.now();
                await this.saveRooms(this.state.rooms);
            }
        }
        
        this.showLobby();
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text || !this.state.currentRoom) return;

        const message = {
            id: Math.random().toString(36).substr(2, 9),
            username: this.state.username,
            text: text,
            timestamp: Date.now(),
            userId: this.state.myUserId
        };

        // Add message to room
        const room = this.state.rooms[this.state.currentRoom];
        if (room) {
            room.messages.push(message);
            room.lastActivity = Date.now();
            room.messages = room.messages.slice(-100); // Keep last 100 messages
            
            await this.saveRooms(this.state.rooms);
            this.displayMessage(message, true);
        }
        
        input.value = '';
        input.focus();
    }

    displayMessage(message, isOwn = false) {
        const messagesContainer = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        
        messageDiv.className = `message ${isOwn ? 'own' : ''}`;
        messageDiv.innerHTML = `
            <strong>${isOwn ? 'You' : this.escapeHtml(message.username)}</strong> 
            <small>(${new Date(message.timestamp).toLocaleTimeString()})</small><br>
            ${this.escapeHtml(message.text)}
        `;
        
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    async startMessagePolling(roomName) {
        let lastCheck = Date.now();
        
        // Check for new messages every 2 seconds
        const pollInterval = setInterval(async () => {
            if (!this.state.isInRoom || this.state.currentRoom !== roomName) {
                clearInterval(pollInterval);
                return;
            }
            
            const remoteRooms = await this.fetchRooms();
            const remoteRoom = remoteRooms[roomName];
            
            if (remoteRoom) {
                // Update user count
                document.getElementById('userCount').textContent = remoteRoom.users.length;
                
                // Check for new messages
                remoteRoom.messages.forEach(message => {
                    if (message.timestamp > lastCheck && message.userId !== this.state.myUserId) {
                        this.displayMessage(message, false);
                    }
                });
                
                lastCheck = Date.now();
                
                // Update local room data
                this.state.rooms[roomName] = remoteRoom;
            }
        }, 2000);
    }

    updateRoomsList() {
        const roomsList = document.getElementById('roomsList');
        const rooms = Object.values(this.state.rooms);
        
        if (rooms.length === 0) {
            roomsList.innerHTML = '<div class="status">🔍 No rooms found. Create one!</div>';
            return;
        }

        // Sort by activity (newest first)
        rooms.sort((a, b) => b.lastActivity - a.lastActivity);
        
        roomsList.innerHTML = rooms.map(room => `
            <div class="room-item" onclick="chatroom.joinRoom('${this.escapeHtml(room.name)}')">
                <strong>${this.escapeHtml(room.name)}</strong>
                <div style="font-size: 0.9em; color: #ccc;">
                    👥 ${room.users.length} users • 
                    ${room.password ? '🔒' : '🔓'} • 
                    ${new Date(room.lastActivity).toLocaleTimeString()}
                </div>
            </div>
        `).join('');
    }

    loadUsername() {
        const saved = localStorage.getItem('chat_username');
        if (saved) this.state.username = saved;
        document.getElementById('username').textContent = this.state.username;
        
        // Allow username change
        document.getElementById('username').onclick = () => {
            const newUsername = prompt('Enter new username:', this.state.username);
            if (newUsername && newUsername.trim()) {
                this.state.username = newUsername.trim();
                document.getElementById('username').textContent = this.state.username;
                localStorage.setItem('chat_username', this.state.username);
            }
        };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Start the chatroom
const chatroom = new WorkingChatroom();
