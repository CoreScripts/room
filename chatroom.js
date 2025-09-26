class Chatroom {
    constructor() {
        this.state = {
            currentRoom: null,
            username: 'User_' + Math.floor(Math.random() * 10000),
            rooms: new Map(),
            isInRoom: false,
            lastRoomUpdate: 0
        };

        this.signaling = new GitHubSignaling();
        this.init();
    }

    init() {
        this.bindEvents();
        this.showLobby();
        this.loadUsername();
        
        // 🔄 NEW: Start automatic room discovery
        this.startRoomDiscovery();
    }

    // 🔄 NEW: Automatic room discovery across devices
    startRoomDiscovery() {
        this.signaling.startRoomDiscovery((rooms) => {
            this.state.rooms = rooms;
            this.updateRoomsList();
        });
    }

    // 🔄 UPDATED: Room creation with proper registration
    async createRoom() {
        const roomName = document.getElementById('roomName').value.trim();
        const password = document.getElementById('roomPassword').value.trim();

        if (!roomName) {
            alert('Please enter a room name');
            return;
        }

        // Register room globally
        await this.signaling.registerRoom(roomName, password || null);

        // Create local room object
        const room = {
            name: roomName,
            password: password || null,
            users: new Set([this.state.username]),
            messages: [],
            created: Date.now(),
            lastActivity: Date.now()
        };

        this.state.rooms.set(roomName, room);
        this.showRoom(roomName);
        
        // Clear inputs
        document.getElementById('roomName').value = '';
        document.getElementById('roomPassword').value = '';
    }

    // 🔄 UPDATED: Room joining with cross-device support
    async joinRoom(roomName, password = '') {
        let room = this.state.rooms.get(roomName);
        
        if (!room) {
            // Room might be from another device - create placeholder
            room = {
                name: roomName,
                password: password || null,
                users: new Set(),
                messages: [],
                fromRemote: true // Mark as discovered from another device
            };
            this.state.rooms.set(roomName, room);
        }

        if (room.password && room.password !== password) {
            alert('Wrong password!');
            return;
        }

        room.users.add(this.state.username);
        room.lastActivity = Date.now();
        
        this.showRoom(roomName);

        // 🔄 NEW: Notify other devices we joined
        await this.signaling.sendMessage('user_joined', {
            username: this.state.username,
            room: roomName
        }, roomName);
    }

    // 🔄 UPDATED: Room list shows cross-device rooms
    updateRoomsList() {
        const roomsList = document.getElementById('roomsList');
        
        if (this.state.rooms.size === 0) {
            roomsList.innerHTML = '<div class="loading">🔍 Searching for rooms...</div>';
            return;
        }

        roomsList.innerHTML = '';
        
        // Sort rooms by activity (newest first)
        const sortedRooms = Array.from(this.state.rooms.entries())
            .sort(([,a], [,b]) => (b.lastActivity || 0) - (a.lastActivity || 0));

        sortedRooms.forEach(([roomName, room]) => {
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            
            // 🔄 NEW: Indicate if room is from another device
            const remoteIndicator = room.fromRemote ? ' 🌐' : '';
            
            roomDiv.innerHTML = `
                <div class="room-name">${this.escapeHtml(roomName)}${remoteIndicator}</div>
                <div class="room-meta">
                    👥 ${room.users.size} users • 
                    ${room.password ? '🔒 Password protected' : '🔓 Open to join'}
                    ${room.fromRemote ? '• Remote' : ''}
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

    // ... rest of the methods ...
}
