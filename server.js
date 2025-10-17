// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイルを public から配信（index.html をルートに置く）
app.use(express.static(path.join(__dirname, 'public')));

// ルートで index.html を返す（念のため）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log('Starting signaling server...');

const rooms = {}; // code -> { owner: ws, viewer: ws }

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let parsed = null;
    try { parsed = JSON.parse(msg.toString()); } catch(e){ return; }
    const { action, code, sdp, candidate } = parsed;

    if (action === 'create') {
      rooms[code] = rooms[code] || {};
      rooms[code].owner = ws;
      ws._role = 'owner'; ws._code = code;
      ws.send(JSON.stringify({ type:'created', code }));
      return;
    }

    if (action === 'join') {
      const room = rooms[code];
      if (!room || !room.owner) {
        ws.send(JSON.stringify({ type:'error', reason:'ルームが見つからない' }));
        return;
      }
      room.viewer = ws;
      ws._role = 'viewer'; ws._code = code;
      room.owner.send(JSON.stringify({ type:'peer-joined', code }));
      return;
    }

    if (action === 'offer') {
      const room = rooms[code];
      if (room && room.viewer && room.viewer.readyState === WebSocket.OPEN) {
        room.viewer.send(JSON.stringify({ type:'offer', sdp }));
      } else {
        ws.send(JSON.stringify({ type:'error', reason:'viewer not connected yet' }));
      }
      return;
    }

    if (action === 'answer') {
      const room = rooms[code];
      if (room && room.owner && room.owner.readyState === WebSocket.OPEN) {
        room.owner.send(JSON.stringify({ type:'answer', sdp }));
      }
      return;
    }

    if (action === 'ice-candidate') {
      const room = rooms[code];
      if (ws._role === 'owner' && room && room.viewer && room.viewer.readyState === WebSocket.OPEN) {
        room.viewer.send(JSON.stringify({ type:'ice-candidate', candidate }));
      } else if (ws._role === 'viewer' && room && room.owner && room.owner.readyState === WebSocket.OPEN) {
        room.owner.send(JSON.stringify({ type:'ice-candidate', candidate }));
      }
      return;
    }
  });

  ws.on('close', () => {
    if (ws._code) {
      const r = rooms[ws._code];
      if (r) {
        if (r.owner === ws) {
          if (r.viewer && r.viewer.readyState === WebSocket.OPEN) r.viewer.send(JSON.stringify({ type:'error', reason:'owner left' }));
          delete rooms[ws._code];
        } else if (r.viewer === ws) {
          if (r.owner && r.owner.readyState === WebSocket.OPEN) r.owner.send(JSON.stringify({ type:'error', reason:'viewer left' }));
          delete rooms[ws._code];
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
