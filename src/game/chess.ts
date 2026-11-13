import { PIECE_VALUES } from './classes';
import type {
  BoardGrid,
  ChessMove,
  ChessPiece,
  Difficulty,
  PieceColor,
  PieceType,
  SquareCoord,
} from './types';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const BACK_RANK: PieceType[] = [
  'rook',
  'knight',
  'bishop',
  'queen',
  'king',
  'bishop',
  'knight',
  'rook',
];

export function createInitialBoard(): BoardGrid {
  const grid: BoardGrid = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null),
  );

  for (let col = 0; col < 8; col++) {
    grid[0][col] = {
      id: `b-${BACK_RANK[col]}-${col}`,
      type: BACK_RANK[col],
      color: 'black',
      hasMoved: false,
    };
    grid[1][col] = {
      id: `b-pawn-${col}`,
      type: 'pawn',
      color: 'black',
      hasMoved: false,
    };
    grid[6][col] = {
      id: `w-pawn-${col}`,
      type: 'pawn',
      color: 'white',
      hasMoved: false,
    };
    grid[7][col] = {
      id: `w-${BACK_RANK[col]}-${col}`,
      type: BACK_RANK[col],
      color: 'white',
      hasMoved: false,
    };
  }

  return grid;
}

export function cloneBoard(board: BoardGrid): BoardGrid {
  return board.map((row) =>
    row.map((cell) => (cell ? { ...cell } : null)),
  );
}

export function isInBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function squareToAlgebraic(sq: SquareCoord): string {
  return `${FILES[sq.col]}${8 - sq.row}`;
}

function pieceNotationPrefix(type: PieceType): string {
  switch (type) {
    case 'pawn':
      return '';
    case 'knight':
      return 'N';
    case 'bishop':
      return 'B';
    case 'rook':
      return 'R';
    case 'queen':
      return 'Q';
    case 'king':
      return 'K';
  }
}

export function buildMoveNotation(
  piece: ChessPiece,
  from: SquareCoord,
  to: SquareCoord,
  captured: ChessPiece | null,
  promotion?: PieceType,
): string {
  const prefix = pieceNotationPrefix(piece.type);
  const fromStr = squareToAlgebraic(from);
  const toStr = squareToAlgebraic(to);
  const sep = captured ? 'x' : '-';
  const promo = promotion ? '=Q' : '';
  if (piece.type === 'pawn' && captured) {
    return `${fromStr[0]}x${toStr}${promo}`;
  }
  return `${prefix}${fromStr}${sep}${toStr}${promo}`;
}

export function getLegalMovesForSquare(
  board: BoardGrid,
  from: SquareCoord,
): ChessMove[] {
  const piece = board[from.row]?.[from.col];
  if (!piece) return [];

  const moves: ChessMove[] = [];
  const pushMove = (toRow: number, toCol: number) => {
    if (!isInBounds(toRow, toCol)) return false;
    const target = board[toRow][toCol];
    if (target && target.color === piece.color) return false;

    const to = { row: toRow, col: toCol };
    const isPromo =
      piece.type === 'pawn' &&
      ((piece.color === 'white' && toRow === 0) ||
        (piece.color === 'black' && toRow === 7));
    const promotion: PieceType | undefined = isPromo ? 'queen' : undefined;

    moves.push({
      from: { ...from },
      to,
      piece,
      captured: target,
      promotion,
      notation: buildMoveNotation(piece, from, to, target, promotion),
    });

    return target === null; // true if sliding piece can continue
  };

  if (piece.type === 'pawn') {
    const dir = piece.color === 'white' ? -1 : 1;
    const startRow = piece.color === 'white' ? 6 : 1;
    const oneStepRow = from.row + dir;
    if (isInBounds(oneStepRow, from.col) && board[oneStepRow][from.col] === null) {
      pushMove(oneStepRow, from.col);
      const twoStepRow = from.row + dir * 2;
      if (
        from.row === startRow &&
        isInBounds(twoStepRow, from.col) &&
        board[twoStepRow][from.col] === null
      ) {
        pushMove(twoStepRow, from.col);
      }
    }
    for (const dCol of [-1, 1]) {
      const capRow = from.row + dir;
      const capCol = from.col + dCol;
      if (isInBounds(capRow, capCol)) {
        const target = board[capRow][capCol];
        if (target && target.color !== piece.color) {
          pushMove(capRow, capCol);
        }
      }
    }
    return moves;
  }

  if (piece.type === 'knight') {
    const offsets = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dr, dc] of offsets) {
      pushMove(from.row + dr, from.col + dc);
    }
    return moves;
  }

  if (piece.type === 'king') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        pushMove(from.row + dr, from.col + dc);
      }
    }
    return moves;
  }

  const dirs: [number, number][] = [];
  if (piece.type === 'rook' || piece.type === 'queen') {
    dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }
  if (piece.type === 'bishop' || piece.type === 'queen') {
    dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }

  for (const [dr, dc] of dirs) {
    let r = from.row + dr;
    let c = from.col + dc;
    while (isInBounds(r, c)) {
      const canContinue = pushMove(r, c);
      if (!canContinue) break;
      r += dr;
      c += dc;
    }
  }

  return moves;
}

export function getAllLegalMoves(
  board: BoardGrid,
  color: PieceColor,
): ChessMove[] {
  const all: ChessMove[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece && piece.color === color) {
        all.push(...getLegalMovesForSquare(board, { row: r, col: c }));
      }
    }
  }
  return all;
}

export function findKingSquare(
  board: BoardGrid,
  color: PieceColor,
): SquareCoord | null {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color && p.type === 'king') {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

export function isSquareAttackedBy(
  board: BoardGrid,
  target: SquareCoord,
  attackerColor: PieceColor,
): boolean {
  const enemyMoves = getAllLegalMoves(board, attackerColor);
  return enemyMoves.some(
    (m) => m.to.row === target.row && m.to.col === target.col,
  );
}

export function isKingInCheck(board: BoardGrid, color: PieceColor): boolean {
  const kingSq = findKingSquare(board, color);
  if (!kingSq) return false;
  const opp: PieceColor = color === 'white' ? 'black' : 'white';
  return isSquareAttackedBy(board, kingSq, opp);
}

export function countPieces(
  board: BoardGrid,
): { white: number; black: number } {
  let white = 0;
  let black = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p?.color === 'white') white++;
      else if (p?.color === 'black') black++;
    }
  }
  return { white, black };
}

export function applyQuietMove(board: BoardGrid, move: ChessMove): BoardGrid {
  const next = cloneBoard(board);
  const moving = next[move.from.row][move.from.col];
  if (!moving) return next;
  next[move.from.row][move.from.col] = null;
  next[move.to.row][move.to.col] = {
    ...moving,
    type: move.promotion ?? moving.type,
    hasMoved: true,
  };
  return next;
}

/**
 * Resolves a capture duel in FPS Chess:
 * - If attackerWon: attacker claims destination square and defender is removed.
 * - If !attackerWon: attacker is eliminated from origin square and defender holds destination square.
 */
export function applyDuelOutcome(
  board: BoardGrid,
  move: ChessMove,
  attackerWon: boolean,
): {
  nextBoard: BoardGrid;
  winner: PieceColor | null;
  winReason: string | null;
} {
  const next = cloneBoard(board);
  const attacker = next[move.from.row][move.from.col];
  const defender = next[move.to.row][move.to.col];

  if (attackerWon && attacker) {
    next[move.from.row][move.from.col] = null;
    next[move.to.row][move.to.col] = {
      ...attacker,
      type: move.promotion ?? attacker.type,
      hasMoved: true,
    };
  } else {
    // Defender wins: attacker is eliminated!
    next[move.from.row][move.from.col] = null;
  }

  const whiteKingAlive = findKingSquare(next, 'white') !== null;
  const blackKingAlive = findKingSquare(next, 'black') !== null;

  if (!blackKingAlive) {
    return {
      nextBoard: next,
      winner: 'white',
      winReason:
        defender?.color === 'black' && defender.type === 'king'
          ? 'Black King defeated in arena combat.'
          : 'Black King eliminated.',
    };
  }
  if (!whiteKingAlive) {
    return {
      nextBoard: next,
      winner: 'black',
      winReason:
        attacker?.color === 'white' && attacker.type === 'king'
          ? 'White King fell during the assault.'
          : 'White King defeated in arena combat.',
    };
  }

  return { nextBoard: next, winner: null, winReason: null };
}

function evaluateBoardHeuristic(board: BoardGrid, aiColor: PieceColor): number {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const centerDist = Math.abs(3.5 - r) + Math.abs(3.5 - c);
      const positional = (7 - centerDist) * 6;
      const advance =
        p.type === 'pawn'
          ? (p.color === 'black' ? r : 7 - r) * 14
          : 0;
      const val = PIECE_VALUES[p.type] + positional + advance;
      score += p.color === aiColor ? val : -val;
    }
  }
  return score;
}

export function chooseAiMove(
  board: BoardGrid,
  aiColor: PieceColor,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): ChessMove | null {
  const moves = getAllLegalMoves(board, aiColor);
  if (moves.length === 0) return null;

  const oppColor: PieceColor = aiColor === 'white' ? 'black' : 'white';
  const scored = moves.map((move) => {
    let score = 0;

    if (move.captured) {
      // Capturing an enemy King is highest priority
      const targetVal = PIECE_VALUES[move.captured.type];
      const selfVal = PIECE_VALUES[move.piece.type];
      // FPS Chess duel odds: stronger piece fighting weaker piece is favored
      const duelConfidence = selfVal >= targetVal ? 0.85 : 0.45;
      score += targetVal * duelConfidence + (move.captured.type === 'king' ? 5000 : 120);
    }

    const simulated = applyQuietMove(board, move);
    score += evaluateBoardHeuristic(simulated, aiColor) * 0.25;

    if (isKingInCheck(simulated, oppColor)) {
      score += 85;
    }

    // Penalize leaving own King exposed on a non-capture move
    if (isKingInCheck(simulated, aiColor)) {
      score -= 220;
    }

    // Small noise based on difficulty
    const noiseAmp =
      difficulty === 'recruit' ? 180 : difficulty === 'tactician' ? 45 : 10;
    score += (rng() - 0.5) * noiseAmp;

    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}
