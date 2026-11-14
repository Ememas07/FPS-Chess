import type { ClientWsMessage, ServerWsMessage } from '../game/multiplayerTypes.ts';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export class MultiplayerClient {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private manualClose = false;
  private reconnectTimer: number | null = null;
  private activeRoomCode: string | null = null;
  private activePlayerId: string | null = null;
  private activePlayerName = 'Challenger';
  private pendingQueue: ClientWsMessage[] = [];

  private onMessageCb: (msg: ServerWsMessage) => void;
  private onStatusCb: (status: ConnectionStatus) => void;

  constructor(
    onMessage: (msg: ServerWsMessage) => void,
    onStatus: (status: ConnectionStatus) => void,
  ) {
    this.onMessageCb = onMessage;
    this.onStatusCb = onStatus;
  }

  public setSessionInfo(
    code: string | null,
    playerId: string | null,
    playerName: string,
  ): void {
    this.activeRoomCode = code;
    this.activePlayerId = playerId;
    this.activePlayerName = playerName;
  }

  public connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.manualClose = false;
    this.setStatus('connecting');

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.setStatus('connected');
      // Re-sync room session on reconnect
      if (this.activeRoomCode && this.activePlayerId) {
        this.send({
          type: 'room:join',
          code: this.activeRoomCode,
          playerName: this.activePlayerName,
          playerId: this.activePlayerId,
        });
      }
      while (this.pendingQueue.length > 0) {
        const next = this.pendingQueue.shift()!;
        ws.send(JSON.stringify(next));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as ServerWsMessage;
        this.onMessageCb(parsed);
      } catch {
        // Ignore malformed server message
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.setStatus('disconnected');
      if (!this.manualClose && this.activeRoomCode) {
        this.reconnectTimer = window.setTimeout(() => {
          this.connect();
        }, 1200);
      }
    };

    ws.onerror = () => {
      // onclose handles cleanup/reconnect
    };
  }

  public send(msg: ClientWsMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return;
    }
    // Queue critical room/chess/fire messages while connecting
    if (msg.type !== 'duel:pose') {
      this.pendingQueue.push(msg);
      this.connect();
    }
  }

  public disconnect(): void {
    this.manualClose = true;
    this.activeRoomCode = null;
    this.activePlayerId = null;
    this.pendingQueue = [];
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  private setStatus(next: ConnectionStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.onStatusCb(next);
  }
}
