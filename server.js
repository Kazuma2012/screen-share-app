
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

const rooms = {}; // code -> { owner: ws, viewer: ws, pendingOffer?: sdp }

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    let parsed = null;
    try {
      parsed = JSON.parse(msg.toString());
    } catch (e) {
      return;
    }

    const { action, code, sdp, candidate } = parsed;

    // === ルーム作成 ===
    if (action === 'create') {
      rooms[code] = rooms[code] || {};
      rooms[code].owner = ws;
      ws._role = 'owner';
      ws._code = code;
      ws.send(JSON.stringify({ type: 'created', code }));
      return;
    }

    // === 視聴者が参加 ===
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

      // 👇 viewer が後から来た場合、pendingOffer があれば送信
      if (room.pendingOffer) {
        ws.send(JSON.stringify({ type: 'offer', sdp: room.pendingOffer }));
        delete room.pendingOffer;
        console.log(`sent stored offer to viewer for code ${code}`);
      }
      return;
    }

    // === オーナー → viewer に offer 送信 ===
    if (action === 'offer') {
      const room = rooms[code] || (rooms[code] = {});
      room.pendingOffer = sdp; // viewerがいない場合に備えて保存

      if (room.viewer && room.viewer.readyState === WebSocket.OPEN) {
        room.viewer.send(JSON.stringify({ type: 'offer', sdp }));
        delete room.pendingOffer;
      } else {
        console.log(`viewer not connected yet for code ${code}, offer stored`);
      }
      return;
    }

    // === viewer → owner に answer 送信 ===
    if (action === 'answer') {
      const room = rooms[code];
      if (room && room.owner && room.owner.readyState === WebSocket.OPEN) {
        room.owner.send(JSON.stringify({ type: 'answer', sdp }));
      }
      return;
    }

    // === ICE candidate 転送 ===
    if (action === 'ice-candidate') {
      const room = rooms[code];
      if (
        ws._role === 'owner' &&
        room &&
        room.viewer &&
        room.viewer.readyState === WebSocket.OPEN
      ) {
        room.viewer.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      } else if (
        ws._role === 'viewer' &&
        room &&
        room.owner &&
        room.owner.readyState === WebSocket.OPEN
      ) {
        room.owner.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      }
      return;
    }
  });

  // === 接続終了時のクリーンアップ ===
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

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
