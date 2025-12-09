const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static for local testing
app.use(express.static(path.join(__dirname, 'public')));

// Rooms map
const rooms = new Map(); // roomId => { room, name, hostId, hostName, hostWs, players: [{id,name,ws}] }

function broadcastGames(){
  const games = Array.from(rooms.values()).map(r=>({ room: r.room, name: r.name, hostId: r.hostId, hostName: r.hostName, players: r.players.map(p=>({id:p.id,name:p.name})) }));
  const msg = JSON.stringify({ type: 'games', games });
  wss.clients.forEach(c=>{ if (c.readyState===WebSocket.OPEN) c.send(msg); });
}

wss.on('connection', ws=>{
  ws._id = uuidv4();
  ws.on('message', message=>{
    let msg;
    try{ msg = JSON.parse(message); } catch(e){ return; }
    if (msg.type === 'list'){
      ws.send(JSON.stringify({ type:'games', games: Array.from(rooms.values()).map(r=>({ room: r.room, name: r.name, hostId: r.hostId, hostName: r.hostName, players: r.players.map(p=>({id:p.id,name:p.name})) })) }));
    } else if (msg.type === 'create'){
      const roomId = uuidv4().slice(0,8);
      const hostId = ws._id;
      const room = { room: roomId, name: msg.name||('Game-'+Math.floor(Math.random()*999)), hostId, hostName: msg.name||'Host', hostWs: ws, players: [] };
      rooms.set(roomId, room);
      ws.send(JSON.stringify({ type:'created', room: roomId, hostId }));
      broadcastGames();
    } else if (msg.type === 'join_request'){
      const room = rooms.get(msg.room);
      if (!room){ ws.send(JSON.stringify({ type:'error', error:'no-room' })); return; }
      const playerId = uuidv4();
      room.players.push({ id: playerId, name: msg.name, ws });
      // notify host
      if (room.hostWs && room.hostWs.readyState===WebSocket.OPEN){
        room.hostWs.send(JSON.stringify({ type:'join_request', name: msg.name, playerId }));
      }
      broadcastGames();
    } else if (msg.type === 'accept'){
      const room = rooms.get(msg.room);
      if (!room) return;
      const pidx = room.players.findIndex(p=>p.id===msg.playerId);
      if (pidx===-1) return;
      const player = room.players[pidx];
      if (player.ws && player.ws.readyState===WebSocket.OPEN){
        player.ws.send(JSON.stringify({ type:'join_accepted', room: room.room, playerId: player.id, hostId: room.hostId, hostName: room.hostName }));
      }
      broadcastGames();
    } else if (msg.type === 'reject'){
      const room = rooms.get(msg.room);
      if (!room) return;
      const pidx = room.players.findIndex(p=>p.id===msg.playerId);
      if (pidx===-1) return;
      const player = room.players[pidx];
      if (player.ws && player.ws.readyState===WebSocket.OPEN){
        player.ws.send(JSON.stringify({ type:'rejected' }));
      }
      room.players.splice(pidx,1);
      broadcastGames();
    } else if (msg.type === 'move'){
      const room = rooms.get(msg.room);
      if (!room) return;
      const payload = JSON.stringify({ type:'move', board: msg.board, turn: msg.turn });
      // send to host and players
      if (room.hostWs && room.hostWs.readyState===WebSocket.OPEN) room.hostWs.send(payload);
      room.players.forEach(p=>{ if (p.ws && p.ws.readyState===WebSocket.OPEN) p.ws.send(payload); });
    } else if (msg.type === 'close'){
      const room = rooms.get(msg.room);
      if (!room) return;
      // notify players
      room.players.forEach(p=>{ if (p.ws && p.ws.readyState===WebSocket.OPEN) p.ws.send(JSON.stringify({ type:'rejected', reason:'host_closed' })); });
      rooms.delete(msg.room);
      broadcastGames();
    }
  });

  ws.on('close', ()=>{
    // remove from rooms if host or player
    for (const [id, room] of rooms){
      if (room.hostWs === ws){
        // close room
        room.players.forEach(p=>{ if (p.ws && p.ws.readyState===WebSocket.OPEN) p.ws.send(JSON.stringify({ type:'rejected', reason:'host_disconnected' })); });
        rooms.delete(id);
      } else {
        const pidx = room.players.findIndex(p=>p.ws===ws);
        if (pidx!==-1) room.players.splice(pidx,1);
      }
    }
    broadcastGames();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server listening on', PORT));
