const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4033;
const clients = new Map(); // Maps userId to client data
const usersByUuid = new Map(); // Maps UUID to userId
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
  let userId = null;
  let userUuid = null;
  
  console.log('New WebSocket connection established, waiting for identification...');

  function initializeUser(uuid) {
    userUuid = uuid;
    
    // Check if this UUID already has a userId
    if (usersByUuid.has(uuid)) {
      userId = usersByUuid.get(uuid);
      console.log(`User ${userId} reconnected with UUID ${uuid}`);
      
      // Update the WebSocket connection for this user
      if (clients.has(userId)) {
        clients.get(userId).ws = ws;
      }
    } else {
      // New user
      userId = ++userIdCounter;
      const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
      const userColor = colors[(userId - 1) % colors.length];
      
      usersByUuid.set(uuid, userId);
      clients.set(userId, {
        ws: ws,
        color: userColor,
        id: userId,
        uuid: uuid
      });
      
      console.log(`New user ${userId} created with UUID ${uuid}. Total clients: ${clients.size}`);
      
      // Notify other users about the new user
      broadcast({
        type: 'userJoined',
        userId: userId,
        color: userColor
      }, userId);
    }
    
    const client = clients.get(userId);
    
    // Send init message to this user
    ws.send(JSON.stringify({
      type: 'init',
      userId: userId,
      color: client.color
    }));

    // Send existing users to this user
    clients.forEach((existingClient, existingUserId) => {
      if (existingUserId !== userId) {
        ws.send(JSON.stringify({
          type: 'userJoined',
          userId: existingUserId,
          color: existingClient.color
        }));
      }
    });
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'identify') {
        initializeUser(data.uuid);
      } else if (data.type === 'morse' && userId !== null) {
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
    if (userId !== null) {
      console.log(`User ${userId} (UUID: ${userUuid}) disconnected. WebSocket closed but user persists.`);
      
      // Don't delete the user from clients map - they can reconnect
      // Just mark them as disconnected by setting ws to null
      if (clients.has(userId)) {
        clients.get(userId).ws = null;
      }
      
      // Don't broadcast userLeft - user can reconnect with same ID
    }
  });
});

function broadcast(message, excludeUserId = null) {
  const messageStr = JSON.stringify(message);
  
  clients.forEach((client, userId) => {
    if (userId !== excludeUserId && client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
    }
  });
}

server.listen(PORT, () => {
  console.log(`Morse code server running on http://localhost:${PORT}`);
});