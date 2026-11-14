export type PieceColor = 'white' | 'black';

export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';

export type Difficulty = 'recruit' | 'tactician' | 'grandmaster';

export type GameMode = 'match' | 'quickduel';

export type AppState = 'title' | 'playing' | 'paused' | 'gameover';

export type PlayPhase = 'board' | 'transition_to_duel' | 'duel' | 'transition_to_board';

export interface ChessPiece {
  id: string;
  type: PieceType;
  color: PieceColor;
  hasMoved: boolean;
}

export type BoardGrid = (ChessPiece | null)[][];

export interface SquareCoord {
  row: number;
  col: number;
}

export interface ChessMove {
  from: SquareCoord;
  to: SquareCoord;
  piece: ChessPiece;
  captured: ChessPiece | null;
  promotion?: PieceType;
  notation: string;
}

export interface ClassSpec {
  type: PieceType;
  label: string;
  weaponName: string;
  weaponRole: string;
  maxHp: number;
  moveSpeed: number;
  jumpSpeed: number;
  damage: number;
  fireInterval: number; // seconds between shots
  magSize: number;
  reloadTime: number;
  pellets: number;
  spreadRad: number;
  range: number;
  projectileSpeed: number; // 0 = hitscan beam/bolt, > 0 = travel speed
  abilityName: string;
  abilityCooldown: number;
  abilityDesc: string;
  aiPolicy: 'skirmisher' | 'brawler' | 'kiter';
  accentHex: string;
}

export interface DuelConfig {
  attacker: ChessPiece;
  defender: ChessPiece;
  move: ChessMove | null; // null in Quick Duel mode
  playerColor: PieceColor;
  isPlayerAttacker: boolean;
  isMultiplayer?: boolean;
}

export interface DuelHudSnapshot {
  playerType: PieceType;
  playerColor: PieceColor;
  playerHp: number;
  playerMaxHp: number;
  enemyType: PieceType;
  enemyColor: PieceColor;
  enemyHp: number;
  enemyMaxHp: number;
  ammo: number;
  magSize: number;
  isReloading: boolean;
  reloadProgress: number; // 0..1
  abilityCooldownRemaining: number;
  abilityCooldownTotal: number;
  abilityActive: boolean;
  pointerLocked: boolean;
  hitMarkerTimer: number;
  lastHitCrit: boolean;
  enemyTelegraphing: boolean;
  duelBanner: string | null;
}

export interface BoardHudSnapshot {
  turn: PieceColor;
  selectedSquare: SquareCoord | null;
  selectedPiece: ChessPiece | null;
  legalMoveCount: number;
  captureMoveCount: number;
  whiteInCheck: boolean;
  blackInCheck: boolean;
  whitePiecesLeft: number;
  blackPiecesLeft: number;
  lastMoveNotation: string | null;
  moveCount: number;
  aiThinking: boolean;
  isMultiplayer?: boolean;
  roomCode?: string;
  myColor?: PieceColor;
  opponentName?: string;
  opponentConnected?: boolean;
}

export interface MatchSummary {
  winner: PieceColor;
  reason: string;
  mode: GameMode;
  movesPlayed: number;
  duelsWon: number;
  duelsFought: number;
  elapsedSeconds: number;
  shotsFired: number;
  shotsHit: number;
  isMultiplayer?: boolean;
  myColor?: PieceColor;
}
