const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const robot = require('robotjs'); // ←追加

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

console.log('Starting signaling server...');

const rooms = {}; // code -> { owner: ws, viewer: ws, pendingOffer?: sdp }
const screenSize = robot.getScreenSize(); // ←画面サイズ取得

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let parsed = null;
    try { parsed = JSON.parse(msg.toString()); } catch(e){ return; }
    const { action, code, sdp, candidate } = parsed;

    // --- OSレベルリモート操作イベント追加 ---
    if (action === 'remote-event') {
      const event = parsed.event;
      try {
        if(event.type === 'mousemove') {
          const scaleX = screenSize.width / event.videoWidth;
          const scaleY = screenSize.height / event.videoHeight;
          robot.moveMouse(event.x * scaleX, event.y * scaleY);
        }
        if(event.type === 'click') robot.mouseClick(event.button === 2 ? 'right' : 'left');
        if(event.type === 'keydown') robot.keyToggle(event.key, 'down');
        if(event.type === 'keyup') robot.keyToggle(event.key, 'up');
      } catch(e) { console.error('remote-event error:', e); }
      return;
    }
    // --- ここまで追加 ---

    // 既存の画面共有処理そのまま
    if (action === 'create') {
      rooms[code] = rooms[code] || {};
      rooms[code].owner = ws;
      ws._role = 'owner';
      ws._code = code;
      ws.send(JSON.stringify({ type: 'created', code }));
      return;
    }
    if (action === 'join') {
      const room = rooms[code];
      if (!room || !room.owner) {
        ws.send(JSON.stringify({ type: 'error', reason: 'ルームが見つからない' }));
        return;
      }
      room.viewer = ws;
      ws._role = 'viewer';
      ws._code = code;
      room.owner.send(JSON.stringify({ type: 'peer-joined', code }));
      if (room.pendingOffer) {
        ws.send(JSON.stringify({ type: 'offer', sdp: room.pendingOffer }));
        delete room.pendingOffer;
      }
      return;
    }
    if (action === 'offer') {
      const room = rooms[code] || (rooms[code] = {});
      room.pendingOffer = sdp;
      if (room.viewer && room.viewer.readyState === WebSocket.OPEN) {
        room.viewer.send(JSON.stringify({ type: 'offer', sdp }));
        delete room.pendingOffer;
      }
      return;
    }
    if (action === 'answer') {
      const room = rooms[code];
      if (room && room.owner && room.owner.readyState === WebSocket.OPEN) {
        room.owner.send(JSON.stringify({ type: 'answer', sdp }));
      }
      return;
    }
    if (action === 'ice-candidate') {
      const room = rooms[code];
      if (
        ws._role === 'owner' && room && room.viewer && room.viewer.readyState === WebSocket.OPEN
      ) room.viewer.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      else if (
        ws._role === 'viewer' && room && room.owner && room.owner.readyState === WebSocket.OPEN
      ) room.owner.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      return;
    }
  });

  ws.on('close', () => {
    if (ws._code) {
      const r = rooms[ws._code];
      if (r) {
        if (r.owner === ws) {
          if (r.viewer && r.viewer.readyState === WebSocket.OPEN)
            r.viewer.send(JSON.stringify({ type: 'error', reason: 'owner left' }));
          delete rooms[ws._code];
        } else if (r.viewer === ws) {
          if (r.owner && r.owner.readyState === WebSocket.OPEN)
            r.owner.send(JSON.stringify({ type: 'error', reason: 'viewer left' }));
          delete rooms[ws._code];
        }
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
