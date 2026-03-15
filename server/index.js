import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

const PORT = process.env.PORT || 3001;
const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'phormula-one-signaling' });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms.has(code) ? generateRoomCode() : code;
}

function broadcastToRoom(roomId, msg, exclude = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = typeof msg === 'string' ? msg : JSON.stringify(msg);
  room.forEach((peer) => {
    if (peer !== exclude && peer.readyState === 1) peer.send(payload);
  });
}

wss.on('connection', (ws, req) => {
  let roomId = null;
  let role = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const { type } = msg;

      if (type === 'create-room') {
        roomId = generateRoomCode();
        role = 'game';
        rooms.set(roomId, new Set([ws]));
        ws.send(JSON.stringify({ type: 'room-created', roomId }));
        return;
      }

      if (type === 'join-room') {
        const code = (msg.roomId || '').toUpperCase().trim();
        if (!code || code.length !== 6) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid room code' }));
          return;
        }
        const room = rooms.get(code);
        if (!room || room.size >= 2) {
          ws.send(JSON.stringify({ type: 'error', message: 'Room not found or full' }));
          return;
        }
        roomId = code;
        role = 'controller';
        room.add(ws);
        ws.send(JSON.stringify({ type: 'joined', roomId }));
        broadcastToRoom(roomId, { type: 'controller-joined' }, ws);
        return;
      }

      if (roomId && (type === 'offer' || type === 'answer' || type === 'ice-candidate')) {
        broadcastToRoom(roomId, msg, ws);
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(roomId);
        else broadcastToRoom(roomId, { type: 'peer-left' });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Signaling server on ws://localhost:${PORT}/ws`);
});
