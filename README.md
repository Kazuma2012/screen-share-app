# Screen Share Demo (Node + WebSocket)

構成: フロントを `public/index.html`、シグナリングは `server.js` で同一 Node サービスとしてホスト。

## ローカル動作確認
1. node 18 を準備
2. npm install
3. npm start
4. ブラウザで http://localhost:3000 を開いてテスト

## GitHub にプッシュ
1. git init
2. git add .
3. git commit -m "初回コミット"
4. GitHub にリポジトリを作成して push

## Render にデプロイ
1. Render にサインインして「New » Web Service」を選択
2. GitHub と連携してリポジトリを選択
3. Branch を選び、Build Command は空（Render が自動で npm install 実行）
4. Start Command: `npm start`
5. Environment: Node のバージョンは package.json の engines を使う（指定可）
6. デプロイ完了後、公開 URL にアクセスするとアプリが表示され、WebRTC/WSS が自動で同一 origin を使うため動作する

## 注意
- 実運用では TURN サーバ導入と HTTPS（Render は https 標準）を確認すること
- 複数同時視聴、認証、スケールを考える場合はサーバ設計を見直すこと
