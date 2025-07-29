const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const clients = new Map();
let userIdCounter = 0;

const server = http.createServer((req, res) => {
  const frontendPath = path.join(__dirname, '../frontend');
  let filePath = path.join(frontendPath, req.url === '/' ? 'index.html' : req.url);
  
  const extname = path.extname(filePath);
  let contentType = 'text/html';
  
  switch (extname) {
    case '.css':
      contentType = 'text/css';
      break;
    case '.js':
      contentType = 'text/javascript';
      break;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const userId = ++userIdCounter;
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
  const userColor = colors[userId % colors.length];
  
  clients.set(userId, {
    ws: ws,
    color: userColor,
    id: userId
  });

  console.log(`User ${userId} connected. Total clients: ${clients.size}`);

  ws.send(JSON.stringify({
    type: 'init',
    userId: userId,
    color: userColor
  }));

  broadcast({
    type: 'userJoined',
    userId: userId,
    color: userColor
  }, userId);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'morse') {
        broadcast({
          type: 'morse',
          userId: userId,
          state: data.state,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => {
    clients.delete(userId);
    console.log(`User ${userId} disconnected. Total clients: ${clients.size}`);
    
    broadcast({
      type: 'userLeft',
      userId: userId
    });
  });
});

function broadcast(message, excludeUserId = null) {
  const messageStr = JSON.stringify(message);
  
  clients.forEach((client, userId) => {
    if (userId !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
    }
  });
}

server.listen(PORT, () => {
  console.log(`Morse code server running on http://localhost:${PORT}`);
});