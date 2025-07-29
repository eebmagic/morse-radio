# Morse Code Experience

A real-time web application for collaborative morse code visualization. Multiple users can connect and tap out morse code patterns that are displayed as scrolling time series on individual rows.

## Features

- **Real-time multi-user morse code visualization**
- **Scrolling timeline** that moves from right to left
- **Individual user rows** with unique colors
- **Spacebar input** for morse code transmission
- **WebSocket-based** real-time communication
- **Responsive design** that works on desktop and mobile

## Setup

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
The frontend is served automatically by the backend server.

## Usage

1. Start the backend server: `cd backend && npm start`
2. Open your browser to `http://localhost:3000`
3. Press and hold **SPACEBAR** to transmit morse code
4. Each connected user appears as a colored row
5. Short presses create dots (·), long presses create dashes (−)

## Architecture

- **Backend**: Node.js WebSocket server with client management
- **Frontend**: Canvas-based real-time visualization
- **Communication**: WebSocket for instant morse code transmission
- **Visualization**: Scrolling time series with individual user rows

## Multi-user Testing

Open multiple browser tabs or windows to `http://localhost:3000` to test the multi-user functionality. Each connection gets a unique color and row for morse code visualization.