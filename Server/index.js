const http = require('http');
const fs = require('fs');
const path = require('path');
const { GameEngine } = require('./game');

const PORT = process.env.PORT || 3000;
const rooms = {}; // roomId -> { game, clients: Map<ws, {id, name}> }

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, '../public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// ─── WebSocket (pure Node.js, no external deps) ──────────────────────────────
// Minimal WebSocket implementation
const crypto = require('crypto');

function wsHandshake(req, socket) {
  const key = req.headers['sec-websocket-key'];
  const acceptKey = crypto
    .createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
  );
}

function parseFrame(buffer) {
  if (buffer.length < 2) return null;
  const byte1 = buffer[0];
  const byte2 = buffer[1];
  const opcode = byte1 & 0x0f;
  const masked = (byte2 & 0x80) !== 0;
  let payloadLength = byte2 & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = Number(buffer.readBigUInt64BE(2));
    offset = 10;
  }

  if (masked) {
    if (buffer.length < offset + 4 + payloadLength) return null;
    const mask = buffer.slice(offset, offset + 4);
    offset += 4;
    const payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = buffer[offset + i] ^ mask[i % 4];
    }
    return { opcode, payload };
  } else {
    if (buffer.length < offset + payloadLength) return null;
    return { opcode, payload: buffer.slice(offset, offset + payloadLength) };
  }
}

function buildFrame(data) {
  const payload = Buffer.from(data);
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

class WSClient {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.onmessage = null;
    this.onclose = null;
    this._closed = false;

    socket.on('data', (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      this._processBuffer();
    });

    socket.on('close', () => {
      if (!this._closed) {
        this._closed = true;
        if (this.onclose) this.onclose();
      }
    });

    socket.on('error', () => {
      if (!this._closed) {
        this._closed = true;
        if (this.onclose) this.onclose();
      }
    });
  }

  _processBuffer() {
    while (this.buffer.length > 0) {
      const frame = parseFrame(this.buffer);
      if (!frame) break;

      const frameSize = this._frameSize(this.buffer);
      this.buffer = this.buffer.slice(frameSize);

      if (frame.opcode === 0x8) { // close
        this.close();
        return;
      }
      if (frame.opcode === 0x9) { // ping
        this.send('pong');
        continue;
      }
      if (frame.opcode === 0x1 || frame.opcode === 0x2) { // text or binary
        if (this.onmessage) this.onmessage(frame.payload.toString());
      }
    }
  }

  _frameSize(buffer) {
    let payloadLength = buffer[1] & 0x7f;
    let offset = 2;
    if (payloadLength === 126) { payloadLength = buffer.readUInt16BE(2); offset = 4; }
    else if (payloadLength === 127) { payloadLength = Number(buffer.readBigUInt64BE(2)); offset = 10; }
    const masked = (buffer[1] & 0x80) !== 0;
    if (masked) offset += 4;
    return offset + payloadLength;
  }

  send(data) {
    if (this._closed) return;
    try {
      this.socket.write(buildFrame(typeof data === 'string' ? data : JSON.stringify(data)));
    } catch (e) {}
  }

  close() {
    if (!this._closed) {
      this._closed = true;
      try { this.socket.destroy(); } catch (e) {}
      if (this.onclose) this.onclose();
    }
  }
}

// ─── Upgrade to WebSocket ─────────────────────────────────────────────────────
server.on('upgrade', (req, socket, head) => {
  wsHandshake(req, socket);
  const ws = new WSClient(socket);
  handleConnection(ws);
});

// ─── Game Logic ───────────────────────────────────────────────────────────────
function handleConnection(ws) {
  let playerRoomId = null;
  let playerId = null;

  ws.onmessage = (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const { type, roomId, ...data } = msg;

    if (type === 'join') {
      const rid = roomId || generateRoomId();
      playerRoomId = rid;
      playerId = data.playerId || generateId();

      if (!rooms[rid]) {
        rooms[rid] = { game: new GameEngine(rid), clients: new Map() };
      }
      const room = rooms[rid];

      // Check if reconnecting
      if (room.game.players[playerId]) {
        room.game.players[playerId].connected = true;
        room.clients.set(ws, { id: playerId, name: room.game.players[playerId].name });
        ws.send(JSON.stringify({ type: 'joined', roomId: rid, playerId, name: room.game.players[playerId].name }));
      } else {
        const player = room.game.addPlayer(playerId, data.name || `Joueur ${room.game.getPlayerCount() + 1}`);
        room.clients.set(ws, { id: playerId, name: player.name });
        ws.send(JSON.stringify({ type: 'joined', roomId: rid, playerId, name: player.name }));
      }

      broadcastState(rid);
    }

    if (!playerRoomId || !rooms[playerRoomId]) return;
    const room = rooms[playerRoomId];
    const game = room.game;

    if (type === 'start') {
      const result = game.startGame();
      if (result.error) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return; }
      broadcastState(playerRoomId);
    }

    if (type === 'deploy') {
      const result = game.deployTroops(playerId, data.territory, data.amount);
      if (result.error) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return; }
      broadcastState(playerRoomId);
    }

    if (type === 'attack') {
      const result = game.attack(playerId, data.from, data.to, data.amount);
      if (result.error) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return; }
      broadcastState(playerRoomId);
    }

    if (type === 'move') {
      const result = game.moveTroops(playerId, data.from, data.to, data.amount);
      if (result.error) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return; }
      broadcastState(playerRoomId);
    }

    if (type === 'diplomacy') {
      const result = game.sendDiplomacy(playerId, data.to, data.message, data.gold || 0);
      if (result.error) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return; }
      broadcastState(playerRoomId);
    }

    if (type === 'next_phase') {
      const result = game.nextPhase(playerId);
      if (result.error) { ws.send(JSON.stringify({ type: 'error', message: result.error })); return; }
      broadcastState(playerRoomId);
    }
  };

  ws.onclose = () => {
    if (playerRoomId && rooms[playerRoomId]) {
      const room = rooms[playerRoomId];
      room.clients.delete(ws);
      if (playerId) room.game.removePlayer(playerId);
      broadcastState(playerRoomId);
    }
  };
}

function broadcastState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  room.clients.forEach((info, ws) => {
    const state = room.game.getStateForPlayer(info.id);
    ws.send(JSON.stringify({ type: 'state', state, myId: info.id }));
  });
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function generateId() {
  return Math.random().toString(36).substring(2, 14);
}

server.listen(PORT, () => {
  console.log(`\n🌍 Risk Game Server lancé sur http://localhost:${PORT}`);
  console.log(`🔗 Partage ce lien à tes amis pour jouer ensemble !\n`);
});
