class MorseCodeVisualizer {
    constructor() {
        this.canvas = document.getElementById('morseCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.userInfo = document.getElementById('userInfo');
        
        this.ws = null;
        this.userId = null;
        this.userColor = null;
        this.users = new Map();
        
        this.rowHeight = 80;
        this.timeScale = 200;
        this.scrollSpeed = 2;
        this.currentTime = 0;
        
        this.spacePressed = false;
        this.lastFrameTime = 0;
        
        this.setupCanvas();
        this.setupWebSocket();
        this.setupEventListeners();
        this.startAnimation();
    }
    
    setupCanvas() {
        const resizeCanvas = () => {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = rect.width * window.devicePixelRatio;
            this.canvas.height = rect.height * window.devicePixelRatio;
            this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
            this.canvas.style.width = rect.width + 'px';
            this.canvas.style.height = rect.height + 'px';
        };
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }
    
    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            this.connectionStatus.textContent = 'Connected';
            this.connectionStatus.classList.add('connected');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
        };
        
        this.ws.onclose = () => {
            this.connectionStatus.textContent = 'Disconnected';
            this.connectionStatus.classList.remove('connected');
            setTimeout(() => this.setupWebSocket(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.connectionStatus.textContent = 'Connection Error';
        };
    }
    
    handleMessage(data) {
        switch (data.type) {
            case 'init':
                this.userId = data.userId;
                this.userColor = data.color;
                this.users.set(data.userId, {
                    color: data.color,
                    signals: [],
                    currentState: false
                });
                this.userInfo.textContent = `You are User ${data.userId}`;
                this.userInfo.style.color = data.color;
                break;
                
            case 'userJoined':
                this.users.set(data.userId, {
                    color: data.color,
                    signals: [],
                    currentState: false
                });
                break;
                
            case 'userLeft':
                this.users.delete(data.userId);
                break;
                
            case 'morse':
                if (this.users.has(data.userId)) {
                    const user = this.users.get(data.userId);
                    user.currentState = data.state;
                    user.signals.push({
                        state: data.state,
                        timestamp: data.timestamp,
                        localTime: this.currentTime
                    });
                    
                    this.cleanOldSignals(user);
                }
                break;
        }
    }
    
    cleanOldSignals(user) {
        const cutoffTime = this.currentTime - (this.canvas.width / this.timeScale) * 1000;
        user.signals = user.signals.filter(signal => signal.localTime > cutoffTime);
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.spacePressed) {
                e.preventDefault();
                this.spacePressed = true;
                this.sendMorseSignal(true);
                
                if (this.users.has(this.userId)) {
                    const user = this.users.get(this.userId);
                    user.currentState = true;
                    user.signals.push({
                        state: true,
                        timestamp: Date.now(),
                        localTime: this.currentTime
                    });
                }
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.spacePressed) {
                e.preventDefault();
                this.spacePressed = false;
                this.sendMorseSignal(false);
                
                if (this.users.has(this.userId)) {
                    const user = this.users.get(this.userId);
                    user.currentState = false;
                    user.signals.push({
                        state: false,
                        timestamp: Date.now(),
                        localTime: this.currentTime
                    });
                }
            }
        });
        
        window.addEventListener('blur', () => {
            if (this.spacePressed) {
                this.spacePressed = false;
                this.sendMorseSignal(false);
                
                if (this.users.has(this.userId)) {
                    const user = this.users.get(this.userId);
                    user.currentState = false;
                    user.signals.push({
                        state: false,
                        timestamp: Date.now(),
                        localTime: this.currentTime
                    });
                }
            }
        });
    }
    
    sendMorseSignal(state) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'morse',
                state: state
            }));
        }
    }
    
    startAnimation() {
        const animate = (timestamp) => {
            const deltaTime = timestamp - this.lastFrameTime;
            this.lastFrameTime = timestamp;
            
            this.currentTime += deltaTime;
            this.draw();
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
    
    draw() {
        const rect = this.canvas.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, width, height);
        
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        
        const userArray = Array.from(this.users.entries());
        const totalUsers = userArray.length;
        const actualRowHeight = Math.min(this.rowHeight, height / Math.max(totalUsers, 1));
        
        userArray.forEach(([userId, user], index) => {
            const y = (index + 1) * actualRowHeight;
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, y - actualRowHeight / 2);
            this.ctx.lineTo(width, y - actualRowHeight / 2);
            this.ctx.stroke();
            
            this.ctx.fillStyle = user.color;
            this.ctx.font = '12px Courier New';
            this.ctx.fillText(`User ${userId}`, 10, y - actualRowHeight / 2 - 5);
            
            this.drawUserSignals(user, y - actualRowHeight / 2, actualRowHeight, width);
        });
    }
    
    drawUserSignals(user, baseY, rowHeight, canvasWidth) {
        const currentX = canvasWidth - 50;
        const signalHeight = rowHeight * 0.6;
        
        // Draw baseline
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(0, baseY);
        this.ctx.lineTo(canvasWidth, baseY);
        this.ctx.stroke();
        
        // Draw signal rectangles for press/release pairs
        this.ctx.fillStyle = user.color;
        
        // Process signals to find press/release pairs
        for (let i = 0; i < user.signals.length - 1; i++) {
            const pressSignal = user.signals[i];
            const releaseSignal = user.signals[i + 1];
            
            // If we have a press followed by a release, draw rectangle
            if (pressSignal.state === true && releaseSignal.state === false) {
                const pressTimeDiff = this.currentTime - pressSignal.localTime;
                const releaseTimeDiff = this.currentTime - releaseSignal.localTime;
                
                const pressX = currentX - (pressTimeDiff / 1000) * this.timeScale;
                const releaseX = currentX - (releaseTimeDiff / 1000) * this.timeScale;
                
                // Since pressSignal is older, pressX should be further left (smaller) than releaseX
                const rectX = Math.min(pressX, releaseX);
                const rectWidth = Math.abs(releaseX - pressX);
                
                // Only draw if rectangle is visible and has positive width
                if (rectWidth > 1 && rectX > -rectWidth && rectX < canvasWidth) {
                    this.ctx.fillRect(rectX, baseY - signalHeight, rectWidth, signalHeight);
                }
            }
        }
        
        // Handle ongoing press (if currently pressed and we have a press signal)
        if (user.currentState && user.signals.length > 0) {
            const lastSignal = user.signals[user.signals.length - 1];
            if (lastSignal.state === true) {
                const pressTimeDiff = this.currentTime - lastSignal.localTime;
                const pressX = currentX - (pressTimeDiff / 1000) * this.timeScale;
                const rectWidth = Math.abs(currentX - pressX);
                const rectX = Math.min(pressX, currentX);
                
                if (rectWidth > 0 && rectX < canvasWidth) {
                    this.ctx.fillRect(rectX, baseY - signalHeight, rectWidth, signalHeight);
                }
            }
        }
        
        // Draw current state indicator
        if (user.currentState) {
            this.ctx.fillStyle = user.color;
            this.ctx.beginPath();
            this.ctx.arc(currentX, baseY - signalHeight / 2, 4, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MorseCodeVisualizer();
});