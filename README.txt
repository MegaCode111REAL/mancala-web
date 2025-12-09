Mancala SE Asia - Full project (local+server)

What you got:
- public/index.html
- public/style.css
- public/script.js
- server.js (Node.js WebSocket server + static file serving for local testing)
- package.json

Important:
- WebSocket server is required for multiplayer to work.
- Vercel's serverless functions do not support persistent WebSocket connections.
  To run multiplayer you must deploy server.js to a host that supports WebSocket servers
  (Render, Railway, DigitalOcean App Platform, a VPS, Fly.io, etc.) or run locally with:
    npm install
    npm start
  Then open http://localhost:3000 in browsers on devices in your network.

- If you only want static hosting on Vercel, you can still use pass-and-play locally; multiplayer will not work on Vercel without an external WebSocket server.

Changing server URL:
- script.js attempts to connect to same origin (ws://location.host). If you run the server on a different domain, edit public/script.js WS_SERVER constant to "wss://your-domain" or "ws://host:port".

Deploy:
- For local testing: npm install && npm start
- For production: deploy server.js to a WebSocket-capable host and point clients to it.
