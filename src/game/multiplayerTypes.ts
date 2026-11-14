import type {
  BoardGrid,
  ChessMove,
  ChessPiece,
  GameMode,
  PieceColor,
  PieceType,
  SquareCoord,
} from './types.ts';

export type RoomStatus = 'waiting' | 'playing' | 'gameover';

export interface PlayerPresence {
  id: string;
  name: string;
  color: PieceColor;
  connected: boolean;
}

export interface DuelActorSnapshot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  ammo: number;
  magSize: number;
  abilityActive: boolean;
}

export interface DuelStateSnapshot {
  attacker: ChessPiece;
  defender: ChessPiece;
  move: ChessMove | null;
  white: DuelActorSnapshot;
  black: DuelActorSnapshot;
  whiteType: PieceType;
  blackType: PieceType;
}

export interface RoomSnapshot {
  code: string;
  status: RoomStatus;
  mode: GameMode;
  phase: 'board' | 'duel';
  board: BoardGrid;
  turn: PieceColor;
  moveCount: number;
  lastMoveNotation: string | null;
  duelsFought: number;
  whiteDuelsWon: number;
  blackDuelsWon: number;
  players: PlayerPresence[];
  duel: DuelStateSnapshot | null;
  winner: PieceColor | null;
  winReason: string | null;
}

// Client -> Server WebSocket Messages
export type ClientWsMessage =
  | { type: 'room:create'; playerName?: string; isPublic?: boolean }
  | { type: 'room:join'; code: string; playerName?: string; playerId?: string }
  | { type: 'room:quickmatch'; playerName?: string }
  | { type: 'room:leave' }
  | { type: 'room:sync' }
  | { type: 'room:rematch' }
  | { type: 'chess:move'; from: SquareCoord; to: SquareCoord }
  | {
      type: 'duel:pose';
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
    }
  | {
      type: 'duel:fire';
      ox: number;
      oy: number;
      oz: number;
      dx: number;
      dy: number;
      dz: number;
    }
  | {
      type: 'duel:ability';
      ox?: number;
      oy?: number;
      oz?: number;
      dx?: number;
      dy?: number;
      dz?: number;
    }
  | { type: 'duel:reload' };

// Server -> Client WebSocket Messages
export type ServerWsMessage =
  | {
      type: 'room:joined';
      code: string;
      playerId: string;
      color: PieceColor;
      room: RoomSnapshot;
    }
  | { type: 'room:state'; room: RoomSnapshot }
  | { type: 'room:error'; message: string }
  | {
      type: 'duel:remote_pose';
      color: PieceColor;
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
    }
  | {
      type: 'duel:shot';
      shooter: PieceColor;
      ox: number;
      oy: number;
      oz: number;
      dx: number;
      dy: number;
      dz: number;
      hit: boolean;
      headshot: boolean;
      damage: number;
      hitX: number;
      hitY: number;
      hitZ: number;
    }
  | {
      type: 'duel:vitals';
      whiteHp: number;
      blackHp: number;
      whiteAmmo: number;
      blackAmmo: number;
      whiteAbilityActive: boolean;
      blackAbilityActive: boolean;
    }
  | {
      type: 'duel:ended';
      winnerColor: PieceColor;
      attackerWon: boolean;
      room: RoomSnapshot;
    };
