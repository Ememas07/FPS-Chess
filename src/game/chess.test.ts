import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialBoard,
  getLegalMovesForSquare,
  applyQuietMove,
  applyDuelOutcome,
  chooseAiMove,
  countPieces,
} from './chess';

test('initial board has 16 white and 16 black pieces in standard layout', () => {
  const board = createInitialBoard();
  const counts = countPieces(board);
  assert.equal(counts.white, 16);
  assert.equal(counts.black, 16);
  assert.equal(board[7][4]?.type, 'king');
  assert.equal(board[7][4]?.color, 'white');
  assert.equal(board[0][3]?.type, 'queen');
  assert.equal(board[0][3]?.color, 'black');
});

test('white pawn at e2 has two opening forward moves (e3 and e4)', () => {
  const board = createInitialBoard();
  const moves = getLegalMovesForSquare(board, { row: 6, col: 4 });
  assert.equal(moves.length, 2);
  assert.deepEqual(
    moves.map((m) => m.notation).sort(),
    ['e2-e3', 'e2-e4'],
  );
});

test('knight can jump over pawns on opening turn', () => {
  const board = createInitialBoard();
  const moves = getLegalMovesForSquare(board, { row: 7, col: 1 });
  assert.equal(moves.length, 2);
  assert.deepEqual(
    moves.map((m) => m.notation).sort(),
    ['Nb1-a3', 'Nb1-c3'],
  );
});

test('duel outcome awards square to attacker on win and eliminates attacker on loss', () => {
  let board = createInitialBoard();
  // Move white e2->e4 and black d7->d5
  const e4 = getLegalMovesForSquare(board, { row: 6, col: 4 }).find(
    (m) => m.to.row === 4 && m.to.col === 4,
  )!;
  board = applyQuietMove(board, e4);
  const d5 = getLegalMovesForSquare(board, { row: 1, col: 3 }).find(
    (m) => m.to.row === 3 && m.to.col === 3,
  )!;
  board = applyQuietMove(board, d5);

  const captureMove = getLegalMovesForSquare(board, { row: 4, col: 4 }).find(
    (m) => m.to.row === 3 && m.to.col === 3,
  )!;
  assert.ok(captureMove.captured);

  // Attacker wins
  const winRes = applyDuelOutcome(board, captureMove, true);
  assert.equal(winRes.winner, null);
  assert.equal(winRes.nextBoard[3][3]?.color, 'white');
  assert.equal(winRes.nextBoard[4][4], null);

  // Attacker loses
  const lossRes = applyDuelOutcome(board, captureMove, false);
  assert.equal(lossRes.winner, null);
  assert.equal(lossRes.nextBoard[3][3]?.color, 'black');
  assert.equal(lossRes.nextBoard[4][4], null);
});

test('eliminating black king ends match with white victory', () => {
  const board = createInitialBoard();
  // Clear pieces between white rook and black king for test
  board[6][4] = null;
  board[1][4] = null;
  board[7][4] = null; // remove white king only? No, keep white king at a1
  board[7][0] = { id: 'w-king-test', type: 'king', color: 'white', hasMoved: true };
  board[7][4] = { id: 'w-rook-test', type: 'rook', color: 'white', hasMoved: true };

  const kingCapture = getLegalMovesForSquare(board, { row: 7, col: 4 }).find(
    (m) => m.to.row === 0 && m.to.col === 4,
  )!;
  assert.equal(kingCapture.captured?.type, 'king');

  const res = applyDuelOutcome(board, kingCapture, true);
  assert.equal(res.winner, 'white');
});

test('AI chooses a valid move on initial board', () => {
  const board = createInitialBoard();
  const move = chooseAiMove(board, 'black', 'tactician', () => 0.5);
  assert.ok(move !== null);
  assert.equal(move.piece.color, 'black');
});
