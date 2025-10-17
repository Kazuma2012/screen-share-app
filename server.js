// server.js
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Render のプロキシを信頼（https対応に必要）
app.set('trust proxy', true);

// 静的ファイル（publicフォルダ）を提供
app.use(express.static('public'));

// Express サーバー起動
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

// WebSocketサーバーをExpressサーバーと同一ポートで起動
const wss = new WebSocketServer({ server });

// ルーム管理（6桁コードごとに接続者を保持）
const rooms = {};

wss.on('connection', (ws) => {
  console.log('🟢 WebSocket接続開始');

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.log('⚠️ JSON解析失敗:', err);
      return;
    }

    const { type, code, payload } = data;
    if (!rooms[code]) rooms[code] = [];

    if (type === 'join') {
      // クライアントをルームに追加
      rooms[code].push(ws);
      ws.roomCode = code;
      console.log(`👥 ${code} に参加 (${rooms[code].length}人)`);
    } 
    else if (['offer', 'answer', 'ice'].includes(type)) {
      // 同じルームの他のクライアントに転送
      rooms[code].forEach(client => {
        if (client !== ws && client.readyState === 1) {
          client.send(JSON.stringify({ type, payload }));
        }
      });
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    if (code && rooms[code]) {
      rooms[code] = rooms[code].filter(c => c !== ws);
      if (rooms[code].length === 0) {
        delete rooms[code];
        console.log(`🧹 ルーム ${code} を削除`);
      } else {
        console.log(`👋 ${code} のクライアント切断 (${rooms[code].length}人残り)`);
      }
    }
  });

  ws.on('error', (err) => {
    console.log('⚠️ WebSocketエラー:', err.message);
  });
});

console.log('🚀 WebSocketサーバー待機中...');
