import test from 'node:test';
import assert from 'node:assert/strict';
import { MultiplayerEngine } from './multiplayerEngine.ts';

test('room create, join, full-room rejection, and reconnect work', () => {
  const engine = new MultiplayerEngine();
  const host = engine.createRoom('Alice');
  assert.equal(host.color, 'white');
  assert.equal(host.snapshot.status, 'waiting');

  const guest = engine.joinRoom(host.snapshot.code, 'Bob');
  assert.equal(guest.ok, true);
  if (!guest.ok) return;
  assert.equal(guest.color, 'black');
  assert.equal(guest.snapshot.status, 'playing');

  // Third player rejected
  const third = engine.joinRoom(host.snapshot.code, 'Charlie');
  assert.equal(third.ok, false);

  // Disconnect & reconnect with existing playerId
  engine.setDisconnected(host.snapshot.code, guest.playerId);
  const rejoined = engine.joinRoom(host.snapshot.code, 'Bob', guest.playerId);
  assert.equal(rejoined.ok, true);
  if (rejoined.ok) {
    assert.equal(rejoined.color, 'black');
  }
});

test('quickmatch pairs two players into one playing room', () => {
  const engine = new MultiplayerEngine();
  const p1 = engine.quickMatch('One');
  assert.equal(p1.snapshot.status, 'waiting');
  const p2 = engine.quickMatch('Two');
  assert.equal(p2.snapshot.code, p1.snapshot.code);
  assert.equal(p2.snapshot.status, 'playing');
});

test('authoritative chess move validation and duel resolution', () => {
  const engine = new MultiplayerEngine();
  const host = engine.createRoom('White');
  const guest = engine.joinRoom(host.snapshot.code, 'Black');
  assert.ok(guest.ok);
  if (!guest.ok) return;
  const code = host.snapshot.code;

  // Black cannot move on White's turn
  const illegalTurn = engine.handleChessMove(
    code,
    guest.playerId,
    { row: 1, col: 4 },
    { row: 3, col: 4 },
  );
  assert.equal(illegalTurn.ok, false);

  // White plays e2->e4
  const m1 = engine.handleChessMove(
    code,
    host.playerId,
    { row: 6, col: 4 },
    { row: 4, col: 4 },
  );
  assert.equal(m1.ok, true);
  if (!m1.ok) return;
  assert.equal(m1.snapshot.turn, 'black');

  // Black plays d7->d5
  const m2 = engine.handleChessMove(
    code,
    guest.playerId,
    { row: 1, col: 3 },
    { row: 3, col: 3 },
  );
  assert.equal(m2.ok, true);

  // White captures e4xd5 -> triggers duel
  const cap = engine.handleChessMove(
    code,
    host.playerId,
    { row: 4, col: 4 },
    { row: 3, col: 3 },
  );
  assert.equal(cap.ok, true);
  if (!cap.ok) return;
  assert.equal(cap.snapshot.phase, 'duel');
  assert.ok(cap.snapshot.duel);

  // White shoots straight along central axis (0, 1.6, 11.2) -> (0, 0, -1) toward Black at (0, 0, -11.2)
  let t = 10000;
  let ended = false;
  for (let i = 0; i < 10; i++) {
    t += 300;
    const fire = engine.handleFire(
      code,
      host.playerId,
      0,
      1.6,
      11.2,
      0,
      0,
      -1,
      t,
    );
    assert.equal(fire.accepted, true);
    assert.equal(fire.shots[0].hit, true);
    if (fire.duelEnded) {
      ended = true;
      assert.equal(fire.duelEnded.winnerColor, 'white');
      assert.equal(fire.duelEnded.attackerWon, true);
      assert.equal(fire.duelEnded.snapshot.phase, 'board');
      assert.equal(fire.duelEnded.snapshot.board[3][3]?.color, 'white');
      break;
    }
  }
  assert.equal(ended, true);
});
