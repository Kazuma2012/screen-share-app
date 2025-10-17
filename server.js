const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {}; // 6桁コードをキーに接続管理

wss.on('connection', ws => {
  ws.on('message', message => {
    let data;
    try { data = JSON.parse(message); } 
    catch { return; }

    const { type, code, payload } = data;

    if (!rooms[code]) rooms[code] = [];
    if(type === 'join') {
      rooms[code].push(ws);
      ws.roomCode = code;
    } else if(type === 'offer' || type === 'answer' || type === 'ice') {
      rooms[code].forEach(client => {
        if(client !== ws) client.send(JSON.stringify({ type, payload }));
      });
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    if(code && rooms[code]) {
      rooms[code] = rooms[code].filter(client => client !== ws);
      if(rooms[code].length === 0) delete rooms[code];
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log('Server running'));
