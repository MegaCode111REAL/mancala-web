// CONFIG: change this to your deployed server's websocket url (wss://...)
// For local testing leave as ws://localhost:3000
const WS_SERVER = (function(){
  // default to same-origin websocket when served from a backend that supports ws
  try {
    if (location.protocol === 'https:') return 'wss://' + location.host + '/';
    return 'ws://' + location.host + '/';
  } catch(e){ return 'ws://mancala-web-rouge.vercel.app'; }
})();

let ws = null;
function ensureWS(){
  if (ws && ws.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(WS_SERVER);
  } catch(e){
    console.warn('WebSocket init failed', e);
    return;
  }
  ws.addEventListener('open', ()=>{ console.log('ws open'); requestGames(); });
  ws.addEventListener('message',(e)=>{ try{ const msg=JSON.parse(e.data); handleServerMessage(msg); }catch(err){console.error(err);} });
  ws.addEventListener('close',()=>{ console.log('ws closed'); setTimeout(ensureWS,1500); });
}

// Game state
const HOUSES = 7;
const INIT = 7;
function makeBoard(){ return { board: Array.from({length:16}).map((_,i)=>{ if (i===7||i===15) return 0; if (i<7) return INIT; return INIT; }), turn: 'south' }; }
let state = makeBoard();
let mode = 'local'; // local | online-host | online-join
let me = { id: null, name: 'You' };
let roomId = null;

// DOM helpers
const boardWrap = document.getElementById('board-wrap');
const modalBack = document.getElementById('modalBack');
function showModal(contentHtml){
  modalBack.innerHTML = '<div class="modal">'+contentHtml+'</div>';
  modalBack.style.display = 'flex';
  modalBack.setAttribute('aria-hidden','false');
}
function closeModal(){ modalBack.innerHTML=''; modalBack.style.display='none'; modalBack.setAttribute('aria-hidden','true'); }
modalBack.addEventListener('click', (e)=>{ if (e.target===modalBack) closeModal(); });

function renderBoard(){
  boardWrap.innerHTML = '';
  const boardEl = document.createElement('div'); boardEl.className='board';

  // left store (north store visually left)
  const leftStore = document.createElement('div'); leftStore.className='store';
  leftStore.innerHTML = '<div style="font-size:13px;color:var(--muted)">North</div><div id="storeP2Count">'+state.board[15]+'</div>';
  boardEl.appendChild(leftStore);

  // pits column
  const pits = document.createElement('div'); pits.className='pits';
  const topRow = document.createElement('div'); topRow.className='row';
  for (let i=HOUSES-1;i>=0;i--){
    const idx = 8 + i;
    const pit = document.createElement('div'); pit.className='pit'; pit.dataset.idx=idx;
    const stones = document.createElement('div'); stones.className='stones';
    renderStones(stones, state.board[idx]);
    pit.appendChild(stones);
    pit.addEventListener('click', ()=>onPitClick(idx));
    topRow.appendChild(pit);
  }
  const bottomRow = document.createElement('div'); bottomRow.className='row';
  for (let i=0;i<HOUSES;i++){
    const idx = i;
    const pit = document.createElement('div'); pit.className='pit'; pit.dataset.idx=idx;
    const stones = document.createElement('div'); stones.className='stones';
    renderStones(stones, state.board[idx]);
    pit.appendChild(stones);
    pit.addEventListener('click', ()=>onPitClick(idx));
    bottomRow.appendChild(pit);
  }
  pits.appendChild(topRow); pits.appendChild(bottomRow);
  boardEl.appendChild(pits);

  // right store (south store)
  const rightStore = document.createElement('div'); rightStore.className='store';
  rightStore.innerHTML = '<div style="font-size:13px;color:var(--muted)">South</div><div id="storeP1Count">'+state.board[7]+'</div>';
  boardEl.appendChild(rightStore);

  // turn & status
  const status = document.createElement('div'); status.style.textAlign='center'; status.style.marginTop='12px';
  status.innerHTML = '<div style="font-weight:800" id="turnLabel">Turn: '+(state.turn==='south'?'South':'North')+'</div><div class="small" id="statusLine">Mode: '+(mode==='local'?'Pass & Play':mode)+'</div>';
  boardWrap.appendChild(boardEl); boardWrap.appendChild(status);
}

function renderStones(container, count){
  container.innerHTML='';
  for (let i=0;i<count;i++){
    const s = document.createElement('div'); s.className='stone';
    container.appendChild(s);
  }
}

function onPitClick(idx){
  // enforce turns for local/pass & play
  if (mode==='online-join' && me.id==null) return;
  if (mode==='local'){
    const isSouth = idx>=0 && idx<=6;
    if ((state.turn==='south' && !isSouth) || (state.turn==='north' && isSouth)) return;
  } else if (mode==='online-join'){
    // only allow moves if it's your side
    const isSouth = idx>=0 && idx<=6;
    if ((state.turn==='south' && !isSouth) || (state.turn==='north' && isSouth)) return;
  }
  if (state.board[idx] <= 0) return;
  sow(idx);
  renderBoard();
  if ((mode==='online-host' || mode==='online-join') && ws && ws.readyState===WebSocket.OPEN) {
    ws.send(JSON.stringify({ type:'move', room: roomId, board: state.board, turn: state.turn }));
  }
}

function sow(startIdx){
  let seeds = state.board[startIdx];
  state.board[startIdx]=0;
  let cur = startIdx;
  while (seeds>0){
    cur = (cur+1)%16;
    // skip opponent store? leaving simple (both stores included)
    state.board[cur]++;
    seeds--;
  }
  // switch turn (simple rule)
  state.turn = (state.turn==='south')?'north':'south';
}

// buttons
document.getElementById('rulesBtn').addEventListener('click', ()=>{ showModal('<h2>Rules</h2><div class="small"><ol><li>7 pits per side, each with 7 seeds initially.</li><li>Pick one pit from your side, sow seeds counter-clockwise.</li><li>If last seed in your store, take another turn (not implemented in simple rules).</li></ol></div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn" onclick="closeModal()">Close</button></div>'); });
document.getElementById('resetBtn').addEventListener('click', ()=>{ state = makeBoard(); renderBoard(); });
document.getElementById('multBtn').addEventListener('click', ()=>{ ensureWS(); openMultiplayer(); });

// Multiplayer UI & WS handling
let gamesCache = [];
function openMultiplayer(){
  showModal('\
    <h2>Multiplayer</h2>\
    <div style="margin-top:12px">\
      <input id="createName" placeholder="Set game name" type="text" />\
      <div style="display:flex;gap:8px;margin-top:8px">\
        <button id="createBtn" class="btn">Create</button>\
        <button id="reloadGames" class="btn ghost">Reload</button>\
        <button id="closeMult" class="btn flat">Close</button>\
      </div>\
    </div>\
    <div style="margin-top:14px"><strong>Current games</strong> <span class="small" id="gamesCount"></span></div>\
    <div id="gamesList" style="margin-top:8px;max-height:240px;overflow:auto"></div>');      document.getElementById('createBtn').addEventListener('click', ()=>{ const nm = document.getElementById('createName').value||('Game-'+Math.floor(Math.random()*999)); createGame(nm); });      document.getElementById('reloadGames').addEventListener('click', ()=>{ requestGames(); });      document.getElementById('closeMult').addEventListener('click', closeModal);      renderGamesList();    }

function renderGamesList(){
  const el = document.getElementById('gamesList');
  if(!el) return;
  el.innerHTML='';
  document.getElementById('gamesCount').textContent = '('+(gamesCache.length)+')';
  if (gamesCache.length===0) el.innerHTML='<div class="small">No games currently. Create one.</div>';
  gamesCache.forEach(g=>{
    const row = document.createElement('div'); row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.padding='10px'; row.style.borderBottom='1px solid #f1f3f5';
    const left = document.createElement('div'); left.innerHTML='<div style="font-weight:700">'+escapeHtml(g.name)+'</div><div class="small">Host: '+escapeHtml(g.hostName)+' • Players: '+(g.players?.length||0)+'</div>';
    const right = document.createElement('div'); const joinBtn = document.createElement('button'); joinBtn.className='btn ghost'; joinBtn.textContent='Join'; joinBtn.addEventListener('click', ()=>{ promptJoin(g.room); }); right.appendChild(joinBtn);
    row.appendChild(left); row.appendChild(right);
    el.appendChild(row);
  });
}

function createGame(name){
  ensureWS();
  if (!ws || ws.readyState!==WebSocket.OPEN){ alertInline('Connecting to server...'); setTimeout(()=>createGame(name),600); return; }
  me.name = name;
  ws.send(JSON.stringify({ type:'create', name }));
}

function promptJoin(room){
  showModal('<h2>Join game</h2><div class="small">Enter username to join</div><div style="margin-top:10px"><input id="joinName" placeholder="Your name" type="text" /></div><div style="display:flex;gap:8px;margin-top:8px"><button id="confirmJoin" class="btn">Send request</button><button id="cancelJoin" class="btn flat">Cancel</button></div>');
  document.getElementById('cancelJoin').addEventListener('click', closeModal);
  document.getElementById('confirmJoin').addEventListener('click', ()=>{ const nm = (document.getElementById('joinName').value||('Player-'+Math.floor(Math.random()*999))); closeModal(); if (ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({ type:'join_request', room, name: nm })); else alertInline('Not connected to server'); });
}

function showHostWaiting(room){
  showModal('<h2>Hosting: '+escapeHtml(me.name)+'</h2><div class="small">Room ID: <strong>'+escapeHtml(room)+'</strong></div><div style="margin-top:10px" id="hostInfo">Waiting for players...</div><div style="display:flex;gap:8px;margin-top:12px"><button id="stopHost" class="btn warn">Stop hosting</button><button id="closeHost" class="btn flat">Close (keeps hosting)</button></div>');
  document.getElementById('stopHost').addEventListener('click', ()=>{ if(ws&&ws.readyState===WebSocket.OPEN){ ws.send(JSON.stringify({ type:'close', room: room })); } mode='local'; roomId=null; closeModal(); state = makeBoard(); renderBoard(); });
  document.getElementById('closeHost').addEventListener('click', closeModal);
}

function showHostAccept(name, playerId){
  showModal('<h2>Accept player?</h2><div class="small">Name: <strong>'+escapeHtml(name)+'</strong></div><div style="display:flex;gap:8px;margin-top:12px"><button id="acceptBtn" class="btn">Yes</button><button id="rejectBtn" class="btn flat">No</button></div>');
  document.getElementById('acceptBtn').addEventListener('click', ()=>{ if(ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({ type:'accept', room: roomId, playerId })); closeModal(); });
  document.getElementById('rejectBtn').addEventListener('click', ()=>{ if(ws&&ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({ type:'reject', room: roomId, playerId })); closeModal(); });
}

function alertInline(msg){ showModal('<h2>Notice</h2><div class="small">'+escapeHtml(msg)+'</div><div style="display:flex;gap:8px;margin-top:12px"><button class="btn" onclick="closeModal()">OK</button></div>'); }

function escapeHtml(s){ return (s+"").replace(/[&<>"'`=\/]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#96;','=':'&#61;'}[c]; }); }

// server messages
function handleServerMessage(msg){
  if (msg.type === 'games'){ gamesCache = msg.games || []; renderGamesList(); }
  else if (msg.type === 'created'){ roomId = msg.room; mode='online-host'; me.id = msg.hostId; showHostWaiting(roomId); }
  else if (msg.type === 'join_request'){ showHostAccept(msg.name, msg.playerId); }
  else if (msg.type === 'join_accepted'){ mode='online-join'; roomId = msg.room; me.id = msg.playerId; closeModal(); alertInline('Joined!'); }
  else if (msg.type === 'move'){ state.board = msg.board; state.turn = msg.turn; renderBoard(); }
  else if (msg.type === 'rejected'){ alertInline('Join rejected'); }
}

function requestGames(){ ensureWS(); if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({ type:'list' })); else setTimeout(requestGames,500); }

function makeBoard(){ const b=Array.from({length:16}).map((_,i)=>{ if(i===7||i===15) return 0; return INIT; }); return { board: b, turn:'south' }; }

// Initialize
state = makeBoard();
renderBoard();
ensureWS();
requestGames();
