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
        this.mousePressed = false;
        this.lastFrameTime = 0;
        
        // Audio setup
        this.audioContext = null;
        this.masterGain = null;
        this.userOscillators = new Map();
        this.baseFrequency = 440; // A4
        this.frequencies = [440, 523, 659, 784, 880, 1047, 1319]; // A4, C5, E5, G5, A5, C6, E6
        
        this.setupAudio();
        this.setupCanvas();
        this.setupWebSocket();
        this.setupEventListeners();
        this.startAnimation();
    }
    
    setupAudio() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.1; // Master volume
            this.masterGain.connect(this.audioContext.destination);
            
            // Show audio prompt if context is suspended
            if (this.audioContext.state === 'suspended') {
                document.getElementById('audioPrompt').style.display = 'block';
                
                // Enable audio on first user interaction
                const enableAudio = () => {
                    this.audioContext.resume().then(() => {
                        document.getElementById('audioPrompt').style.display = 'none';
                    });
                    document.removeEventListener('click', enableAudio);
                    document.removeEventListener('keydown', enableAudio);
                };
                
                document.addEventListener('click', enableAudio);
                document.addEventListener('keydown', enableAudio);
            }
        } catch (error) {
            console.warn('Web Audio API not supported:', error);
        }
    }
    
    getUserFrequency(userId) {
        return this.frequencies[(userId - 1) % this.frequencies.length];
    }
    
    startTone(userId) {
        if (!this.audioContext || this.userOscillators.has(userId)) return;
        
        try {
            // Resume audio context if suspended (required by some browsers)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(this.getUserFrequency(userId), this.audioContext.currentTime);
            
            // Smooth attack to prevent clicking
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.3, this.audioContext.currentTime + 0.01);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.masterGain);
            
            oscillator.start();
            
            this.userOscillators.set(userId, { oscillator, gainNode });
        } catch (error) {
            console.warn('Error starting tone:', error);
        }
    }
    
    stopTone(userId) {
        if (!this.audioContext || !this.userOscillators.has(userId)) return;
        
        try {
            const { oscillator, gainNode } = this.userOscillators.get(userId);
            
            // Smooth release to prevent clicking
            gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.01);
            
            setTimeout(() => {
                try {
                    oscillator.stop();
                } catch (e) {
                    // Oscillator might already be stopped
                }
            }, 20);
            
            this.userOscillators.delete(userId);
        } catch (error) {
            console.warn('Error stopping tone:', error);
        }
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
                const frequency = this.getUserFrequency(data.userId);
                this.userInfo.textContent = `You are User ${data.userId} (${frequency}Hz)`;
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
                    
                    // Play or stop tone based on signal state
                    if (data.state) {
                        this.startTone(data.userId);
                    } else {
                        this.stopTone(data.userId);
                    }
                    
                    this.cleanOldSignals(user);
                }
                break;
        }
    }
    
    cleanOldSignals(user) {
        const cutoffTime = this.currentTime - (this.canvas.width / this.timeScale) * 1000;
        user.signals = user.signals.filter(signal => signal.localTime > cutoffTime);
    }
    
    isSignalActive() {
        return this.spacePressed || this.mousePressed;
    }
    
    startMorseSignal() {
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
    
    stopMorseSignal() {
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

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !this.spacePressed && !this.mousePressed) {
                e.preventDefault();
                this.spacePressed = true;
                this.startMorseSignal();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space' && this.spacePressed) {
                e.preventDefault();
                this.spacePressed = false;
                this.stopMorseSignal();
            }
        });
        
        // Mouse event listeners for canvas
        this.canvas.addEventListener('mousedown', (e) => {
            if (!this.mousePressed && !this.isSignalActive()) {
                e.preventDefault();
                this.mousePressed = true;
                this.startMorseSignal();
            }
        });
        
        this.canvas.addEventListener('mouseup', (e) => {
            if (this.mousePressed) {
                e.preventDefault();
                this.mousePressed = false;
                this.stopMorseSignal();
            }
        });
        
        this.canvas.addEventListener('mouseleave', (e) => {
            if (this.mousePressed) {
                this.mousePressed = false;
                this.stopMorseSignal();
            }
        });
        
        // Touch event listeners for mobile support
        this.canvas.addEventListener('touchstart', (e) => {
            if (!this.mousePressed && !this.isSignalActive()) {
                e.preventDefault();
                this.mousePressed = true;
                this.startMorseSignal();
            }
        });
        
        this.canvas.addEventListener('touchend', (e) => {
            if (this.mousePressed) {
                e.preventDefault();
                this.mousePressed = false;
                this.stopMorseSignal();
            }
        });

        window.addEventListener('blur', () => {
            if (this.spacePressed || this.mousePressed) {
                this.spacePressed = false;
                this.mousePressed = false;
                this.stopMorseSignal();
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
            const frequency = this.getUserFrequency(userId);
            this.ctx.fillText(`User ${userId} (${frequency}Hz)`, 10, y - actualRowHeight / 2 - 5);
            
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