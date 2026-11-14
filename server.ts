import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientWsMessage, ServerWsMessage } from './src/game/multiplayerTypes.ts';
import { MultiplayerEngine } from './src/server/multiplayerEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

interface ClientMeta {
  ws: WebSocket;
  roomCode: string | null;
  playerId: string | null;
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });
  const engine = new MultiplayerEngine();
  const clients = new Map<WebSocket, ClientMeta>();

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', rooms: engine.getRoomCount() });
  });

  function sendTo(ws: WebSocket, msg: ServerWsMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function broadcastRoom(
    code: string,
    msg: ServerWsMessage,
    excludeWs?: WebSocket,
  ): void {
    const payload = JSON.stringify(msg);
    for (const [ws, meta] of clients.entries()) {
      if (ws !== excludeWs && meta.roomCode === code && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  wss.on('connection', (ws) => {
    const meta: ClientMeta = { ws, roomCode: null, playerId: null };
    clients.set(ws, meta);

    ws.on('message', (raw) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientWsMessage;
      } catch {
        sendTo(ws, { type: 'room:error', message: 'Invalid JSON payload.' });
        return;
      }

      if (msg.type === 'room:create') {
        if (meta.roomCode && meta.playerId) {
          const prev = engine.leaveRoom(meta.roomCode, meta.playerId);
          if (prev) broadcastRoom(prev.code, { type: 'room:state', room: prev });
        }
        const res = engine.createRoom(msg.playerName, Boolean(msg.isPublic));
        meta.roomCode = res.snapshot.code;
        meta.playerId = res.playerId;
        sendTo(ws, {
          type: 'room:joined',
          code: res.snapshot.code,
          playerId: res.playerId,
          color: res.color,
          room: res.snapshot,
        });
        return;
      }

      if (msg.type === 'room:join') {
        if (meta.roomCode && meta.playerId && meta.roomCode !== msg.code.toUpperCase()) {
          const prev = engine.leaveRoom(meta.roomCode, meta.playerId);
          if (prev) broadcastRoom(prev.code, { type: 'room:state', room: prev });
        }
        const res = engine.joinRoom(msg.code, msg.playerName, msg.playerId);
        if (!res.ok) {
          sendTo(ws, { type: 'room:error', message: res.error });
          return;
        }
        meta.roomCode = res.snapshot.code;
        meta.playerId = res.playerId;
        sendTo(ws, {
          type: 'room:joined',
          code: res.snapshot.code,
          playerId: res.playerId,
          color: res.color,
          room: res.snapshot,
        });
        broadcastRoom(res.snapshot.code, { type: 'room:state', room: res.snapshot }, ws);
        return;
      }

      if (msg.type === 'room:quickmatch') {
        if (meta.roomCode && meta.playerId) {
          const prev = engine.leaveRoom(meta.roomCode, meta.playerId);
          if (prev) broadcastRoom(prev.code, { type: 'room:state', room: prev });
        }
        const res = engine.quickMatch(msg.playerName);
        meta.roomCode = res.snapshot.code;
        meta.playerId = res.playerId;
        sendTo(ws, {
          type: 'room:joined',
          code: res.snapshot.code,
          playerId: res.playerId,
          color: res.color,
          room: res.snapshot,
        });
        broadcastRoom(res.snapshot.code, { type: 'room:state', room: res.snapshot }, ws);
        return;
      }

      if (msg.type === 'room:leave') {
        if (meta.roomCode && meta.playerId) {
          const updated = engine.leaveRoom(meta.roomCode, meta.playerId);
          if (updated) broadcastRoom(updated.code, { type: 'room:state', room: updated });
        }
        meta.roomCode = null;
        meta.playerId = null;
        return;
      }

      if (msg.type === 'room:sync') {
        if (meta.roomCode) {
          const snap = engine.getSnapshot(meta.roomCode);
          if (snap) sendTo(ws, { type: 'room:state', room: snap });
        }
        return;
      }

      if (msg.type === 'room:rematch') {
        if (meta.roomCode) {
          const snap = engine.rematch(meta.roomCode);
          if (snap) broadcastRoom(snap.code, { type: 'room:state', room: snap });
        }
        return;
      }

      if (!meta.roomCode || !meta.playerId) {
        sendTo(ws, { type: 'room:error', message: 'Join a room first.' });
        return;
      }

      if (msg.type === 'chess:move') {
        const res = engine.handleChessMove(
          meta.roomCode,
          meta.playerId,
          msg.from,
          msg.to,
        );
        if (!res.ok) {
          sendTo(ws, { type: 'room:error', message: res.error });
          return;
        }
        broadcastRoom(meta.roomCode, { type: 'room:state', room: res.snapshot });
        return;
      }

      if (msg.type === 'duel:pose') {
        const pose = engine.updatePose(
          meta.roomCode,
          meta.playerId,
          msg.x,
          msg.y,
          msg.z,
          msg.yaw,
          msg.pitch,
        );
        if (pose) {
          broadcastRoom(
            meta.roomCode,
            { type: 'duel:remote_pose', ...pose },
            ws,
          );
        }
        return;
      }

      if (msg.type === 'duel:reload') {
        engine.handleReload(meta.roomCode, meta.playerId);
        return;
      }

      if (msg.type === 'duel:ability') {
        const aim =
          typeof msg.ox === 'number' &&
          typeof msg.oy === 'number' &&
          typeof msg.oz === 'number' &&
          typeof msg.dx === 'number' &&
          typeof msg.dy === 'number' &&
          typeof msg.dz === 'number'
            ? {
                ox: msg.ox,
                oy: msg.oy,
                oz: msg.oz,
                dx: msg.dx,
                dy: msg.dy,
                dz: msg.dz,
              }
            : undefined;
        const res = engine.handleAbility(meta.roomCode, meta.playerId, Date.now(), aim);
        if (!res.ok) return;
        if (res.shots) {
          for (const shot of res.shots) {
            broadcastRoom(meta.roomCode, { type: 'duel:shot', ...shot });
          }
        }
        if (res.duelVitals) {
          broadcastRoom(meta.roomCode, { type: 'duel:vitals', ...res.duelVitals });
        }
        if (res.duelEnded) {
          broadcastRoom(meta.roomCode, {
            type: 'duel:ended',
            winnerColor: res.duelEnded.winnerColor,
            attackerWon: res.duelEnded.attackerWon,
            room: res.duelEnded.snapshot,
          });
        }
        return;
      }

      if (msg.type === 'duel:fire') {
        const res = engine.handleFire(
          meta.roomCode,
          meta.playerId,
          msg.ox,
          msg.oy,
          msg.oz,
          msg.dx,
          msg.dy,
          msg.dz,
        );
        if (!res.accepted) return;

        for (const shot of res.shots) {
          broadcastRoom(meta.roomCode, { type: 'duel:shot', ...shot });
        }
        if (res.vitals) {
          broadcastRoom(meta.roomCode, { type: 'duel:vitals', ...res.vitals });
        }
        if (res.duelEnded) {
          broadcastRoom(meta.roomCode, {
            type: 'duel:ended',
            winnerColor: res.duelEnded.winnerColor,
            attackerWon: res.duelEnded.attackerWon,
            room: res.duelEnded.snapshot,
          });
        }
      }
    });

    ws.on('close', () => {
      if (meta.roomCode && meta.playerId) {
        const snap = engine.setDisconnected(meta.roomCode, meta.playerId);
        if (snap) {
          broadcastRoom(snap.code, { type: 'room:state', room: snap }, ws);
        }
      }
      clients.delete(ws);
    });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CROWNBREAK server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
