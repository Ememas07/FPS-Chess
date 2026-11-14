import {
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  raycastActorHitbox,
  raycastObstacles,
  resolveCircleAabbCollision,
} from '../game/arenaPhysics.ts';
import {
  applyDuelOutcome,
  applyQuietMove,
  createInitialBoard,
  getAllLegalMoves,
  getLegalMovesForSquare,
} from '../game/chess.ts';
import { CLASS_SPECS } from '../game/classes.ts';
import type {
  DuelActorSnapshot,
  DuelStateSnapshot,
  PlayerPresence,
  RoomSnapshot,
} from '../game/multiplayerTypes.ts';
import type { BoardGrid, ChessMove, PieceColor, SquareCoord } from '../game/types.ts';

interface ServerPlayer extends PlayerPresence {
  lastFireTime: number;
  abilityCooldownUntil: number;
  abilityActiveUntil: number;
  reloadUntil: number;
}

interface ServerRoom {
  code: string;
  isPublic: boolean;
  status: 'waiting' | 'playing' | 'gameover';
  phase: 'board' | 'duel';
  board: BoardGrid;
  turn: PieceColor;
  moveCount: number;
  lastMoveNotation: string | null;
  duelsFought: number;
  whiteDuelsWon: number;
  blackDuelsWon: number;
  players: ServerPlayer[];
  duel: DuelStateSnapshot | null;
  winner: PieceColor | null;
  winReason: string | null;
  updatedAt: number;
}

export interface ShotOutcome {
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

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export class MultiplayerEngine {
  private rooms = new Map<string, ServerRoom>();

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 20; attempt++) {
      let code = '';
      for (let i = 0; i < 5; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `R${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  public getRoomCount(): number {
    return this.rooms.size;
  }

  public toSnapshot(room: ServerRoom): RoomSnapshot {
    return {
      code: room.code,
      status: room.status,
      mode: 'match',
      phase: room.phase,
      board: room.board,
      turn: room.turn,
      moveCount: room.moveCount,
      lastMoveNotation: room.lastMoveNotation,
      duelsFought: room.duelsFought,
      whiteDuelsWon: room.whiteDuelsWon,
      blackDuelsWon: room.blackDuelsWon,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
      })),
      duel: room.duel
        ? {
            ...room.duel,
            white: { ...room.duel.white },
            black: { ...room.duel.black },
          }
        : null,
      winner: room.winner,
      winReason: room.winReason,
    };
  }

  public getSnapshot(code: string): RoomSnapshot | null {
    const room = this.rooms.get(code.toUpperCase());
    return room ? this.toSnapshot(room) : null;
  }

  public createRoom(
    playerName = 'Player 1',
    isPublic = false,
  ): { snapshot: RoomSnapshot; playerId: string; color: PieceColor } {
    const code = this.generateRoomCode();
    const playerId = makeId('p');
    const host: ServerPlayer = {
      id: playerId,
      name: playerName.trim().slice(0, 18) || 'Player 1',
      color: 'white',
      connected: true,
      lastFireTime: 0,
      abilityCooldownUntil: 0,
      abilityActiveUntil: 0,
      reloadUntil: 0,
    };

    const room: ServerRoom = {
      code,
      isPublic,
      status: 'waiting',
      phase: 'board',
      board: createInitialBoard(),
      turn: 'white',
      moveCount: 0,
      lastMoveNotation: null,
      duelsFought: 0,
      whiteDuelsWon: 0,
      blackDuelsWon: 0,
      players: [host],
      duel: null,
      winner: null,
      winReason: null,
      updatedAt: Date.now(),
    };
    this.rooms.set(code, room);
    return { snapshot: this.toSnapshot(room), playerId, color: 'white' };
  }

  public joinRoom(
    rawCode: string,
    playerName = 'Player 2',
    existingPlayerId?: string,
  ):
    | { ok: true; snapshot: RoomSnapshot; playerId: string; color: PieceColor }
    | { ok: false; error: string } {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) {
      return { ok: false, error: `Room "${code}" not found.` };
    }

    if (existingPlayerId) {
      const returning = room.players.find((p) => p.id === existingPlayerId);
      if (returning) {
        returning.connected = true;
        room.updatedAt = Date.now();
        return {
          ok: true,
          snapshot: this.toSnapshot(room),
          playerId: returning.id,
          color: returning.color,
        };
      }
    }

    if (room.players.length >= 2) {
      // Allow replacing a disconnected slot if any
      const disconnected = room.players.find((p) => !p.connected);
      if (disconnected) {
        disconnected.connected = true;
        disconnected.name = playerName.trim().slice(0, 18) || disconnected.name;
        room.updatedAt = Date.now();
        return {
          ok: true,
          snapshot: this.toSnapshot(room),
          playerId: disconnected.id,
          color: disconnected.color,
        };
      }
      return { ok: false, error: `Room "${code}" is already full.` };
    }

    const playerId = makeId('p');
    const assignedColor: PieceColor =
      room.players[0]?.color === 'white' ? 'black' : 'white';
    const guest: ServerPlayer = {
      id: playerId,
      name: playerName.trim().slice(0, 18) || 'Player 2',
      color: assignedColor,
      connected: true,
      lastFireTime: 0,
      abilityCooldownUntil: 0,
      abilityActiveUntil: 0,
      reloadUntil: 0,
    };
    room.players.push(guest);
    room.status = 'playing';
    room.updatedAt = Date.now();

    return {
      ok: true,
      snapshot: this.toSnapshot(room),
      playerId,
      color: assignedColor,
    };
  }

  public quickMatch(playerName = 'Challenger'): {
    snapshot: RoomSnapshot;
    playerId: string;
    color: PieceColor;
  } {
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.status === 'waiting' && room.players.length === 1) {
        const res = this.joinRoom(room.code, playerName);
        if (res.ok) return res;
      }
    }
    return this.createRoom(playerName, true);
  }

  public setDisconnected(code: string, playerId: string): RoomSnapshot | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    const p = room.players.find((pl) => pl.id === playerId);
    if (p) {
      p.connected = false;
      room.updatedAt = Date.now();
    }
    if (room.players.every((pl) => !pl.connected)) {
      this.rooms.delete(code);
      return null;
    }
    return this.toSnapshot(room);
  }

  public leaveRoom(code: string, playerId: string): RoomSnapshot | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.players.length === 0) {
      this.rooms.delete(code);
      return null;
    }
    if (room.status === 'playing') {
      room.status = 'waiting';
      room.phase = 'board';
      room.duel = null;
    }
    room.updatedAt = Date.now();
    return this.toSnapshot(room);
  }

  public rematch(code: string): RoomSnapshot | null {
    const room = this.rooms.get(code);
    if (!room) return null;
    room.board = createInitialBoard();
    room.turn = 'white';
    room.phase = 'board';
    room.duel = null;
    room.moveCount = 0;
    room.lastMoveNotation = null;
    room.duelsFought = 0;
    room.whiteDuelsWon = 0;
    room.blackDuelsWon = 0;
    room.winner = null;
    room.winReason = null;
    room.status = room.players.length >= 2 ? 'playing' : 'waiting';
    room.updatedAt = Date.now();
    return this.toSnapshot(room);
  }

  public handleChessMove(
    code: string,
    playerId: string,
    from: SquareCoord,
    to: SquareCoord,
  ):
    | { ok: true; snapshot: RoomSnapshot }
    | { ok: false; error: string } {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: 'Room not found.' };
    if (room.status !== 'playing' || room.phase !== 'board') {
      return { ok: false, error: 'Cannot move piece right now.' };
    }
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'Player not in room.' };
    if (player.color !== room.turn) {
      return { ok: false, error: 'Not your turn.' };
    }

    const legalMoves = getLegalMovesForSquare(room.board, from);
    const move: ChessMove | undefined = legalMoves.find(
      (m) => m.to.row === to.row && m.to.col === to.col,
    );
    if (!move) {
      return { ok: false, error: 'Illegal chess move.' };
    }

    room.moveCount += 1;
    room.lastMoveNotation = move.notation;
    room.updatedAt = Date.now();

    if (!move.captured) {
      room.board = applyQuietMove(room.board, move);
      room.turn = room.turn === 'white' ? 'black' : 'white';
      if (getAllLegalMoves(room.board, room.turn).length === 0) {
        room.status = 'gameover';
        room.winner = room.turn === 'white' ? 'black' : 'white';
        room.winReason = `${room.turn === 'white' ? 'White' : 'Black'} has no legal moves remaining.`;
      }
      return { ok: true, snapshot: this.toSnapshot(room) };
    }

    // Start Authoritative 1v1 FPS Duel
    const whitePiece =
      move.piece.color === 'white' ? move.piece : move.captured;
    const blackPiece =
      move.piece.color === 'black' ? move.piece : move.captured;

    const wSpec = CLASS_SPECS[whitePiece.type];
    const bSpec = CLASS_SPECS[blackPiece.type];

    const whiteActor: DuelActorSnapshot = {
      x: 0,
      y: 0,
      z: 11.2,
      yaw: 0,
      pitch: 0,
      hp: wSpec.maxHp,
      maxHp: wSpec.maxHp,
      ammo: wSpec.magSize,
      magSize: wSpec.magSize,
      abilityActive: false,
    };
    const blackActor: DuelActorSnapshot = {
      x: 0,
      y: 0,
      z: -11.2,
      yaw: Math.PI,
      pitch: 0,
      hp: bSpec.maxHp,
      maxHp: bSpec.maxHp,
      ammo: bSpec.magSize,
      magSize: bSpec.magSize,
      abilityActive: false,
    };

    for (const p of room.players) {
      p.lastFireTime = 0;
      p.abilityCooldownUntil = 0;
      p.abilityActiveUntil = 0;
      p.reloadUntil = 0;
    }

    room.phase = 'duel';
    room.duel = {
      attacker: move.piece,
      defender: move.captured,
      move,
      white: whiteActor,
      black: blackActor,
      whiteType: whitePiece.type,
      blackType: blackPiece.type,
    };

    return { ok: true, snapshot: this.toSnapshot(room) };
  }

  public updatePose(
    code: string,
    playerId: string,
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number,
  ): { color: PieceColor; x: number; y: number; z: number; yaw: number; pitch: number } | null {
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'duel' || !room.duel) return null;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return null;

    const resolved = resolveCircleAabbCollision(
      Number.isFinite(x) ? x : 0,
      Number.isFinite(z) ? z : 0,
      PLAYER_RADIUS,
      ARENA_OBSTACLES,
      ARENA_HALF_SIZE,
    );
    const clampedY = Math.max(0, Math.min(8, Number.isFinite(y) ? y : 0));

    const actor = player.color === 'white' ? room.duel.white : room.duel.black;
    actor.x = resolved.x;
    actor.y = clampedY;
    actor.z = resolved.z;
    actor.yaw = Number.isFinite(yaw) ? yaw : actor.yaw;
    actor.pitch = Math.max(-1.2, Math.min(1.2, Number.isFinite(pitch) ? pitch : 0));

    return {
      color: player.color,
      x: actor.x,
      y: actor.y,
      z: actor.z,
      yaw: actor.yaw,
      pitch: actor.pitch,
    };
  }

  public handleReload(code: string, playerId: string): boolean {
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'duel' || !room.duel) return false;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return false;

    const actor = player.color === 'white' ? room.duel.white : room.duel.black;
    const pType =
      player.color === 'white' ? room.duel.whiteType : room.duel.blackType;
    const spec = CLASS_SPECS[pType];
    const now = Date.now();
    if (actor.ammo < spec.magSize && now >= player.reloadUntil) {
      player.reloadUntil = now + spec.reloadTime * 1000;
      actor.ammo = spec.magSize;
      return true;
    }
    return false;
  }

  public handleAbility(
    code: string,
    playerId: string,
    now = Date.now(),
    aim?: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number },
  ): {
    ok: boolean;
    shots?: ShotOutcome[];
    duelVitals?: {
      whiteHp: number;
      blackHp: number;
      whiteAmmo: number;
      blackAmmo: number;
      whiteAbilityActive: boolean;
      blackAbilityActive: boolean;
    };
    duelEnded?: {
      winnerColor: PieceColor;
      attackerWon: boolean;
      snapshot: RoomSnapshot;
    };
  } {
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'duel' || !room.duel) return { ok: false };
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return { ok: false };
    if (now < player.abilityCooldownUntil) return { ok: false };

    const sColor = player.color;
    const tColor: PieceColor = sColor === 'white' ? 'black' : 'white';
    const actor = sColor === 'white' ? room.duel.white : room.duel.black;
    const tActor = tColor === 'white' ? room.duel.white : room.duel.black;
    const pType = sColor === 'white' ? room.duel.whiteType : room.duel.blackType;
    const tType = tColor === 'white' ? room.duel.whiteType : room.duel.blackType;
    const spec = CLASS_SPECS[pType];
    const targetPlayer = room.players.find((p) => p.color === tColor);
    player.abilityCooldownUntil = now + spec.abilityCooldown * 1000;

    let shots: ShotOutcome[] | undefined;

    if (pType === 'rook') {
      player.abilityActiveUntil = now + 3000;
      actor.abilityActive = true;
    } else if (pType === 'king') {
      actor.hp = Math.min(actor.maxHp, actor.hp + 45);
      player.abilityActiveUntil = now + 2500;
      actor.abilityActive = true;
    } else if (pType === 'pawn' || pType === 'bishop') {
      actor.ammo = spec.magSize;
      player.reloadUntil = 0;
    } else if (pType === 'queen' && aim) {
      const len = Math.max(1e-5, Math.hypot(aim.dx, aim.dy, aim.dz));
      const baseYaw = Math.atan2(aim.dx / len, aim.dz / len);
      const horizLen = Math.hypot(aim.dx / len, aim.dz / len);
      const baseDy = aim.dy / len;
      const targetShielded =
        tType === 'rook' && targetPlayer && now < targetPlayer.abilityActiveUntil;

      shots = [];
      const count = 5;
      const arcSpread = 0.085;
      for (let i = 0; i < count; i++) {
        const yawOff = (i - (count - 1) / 2) * (arcSpread / count);
        const yAngle = baseYaw + yawOff;
        const rdx = Math.sin(yAngle) * horizLen;
        const rdy = baseDy;
        const rdz = Math.cos(yAngle) * horizLen;
        const rLen = Math.max(1e-5, Math.hypot(rdx, rdy, rdz));
        const ndx = rdx / rLen;
        const ndy = rdy / rLen;
        const ndz = rdz / rLen;

        const obDist = raycastObstacles(
          aim.ox,
          aim.oy,
          aim.oz,
          ndx,
          ndy,
          ndz,
          spec.range,
          ARENA_OBSTACLES,
        );
        const actorHit = raycastActorHitbox(
          aim.ox,
          aim.oy,
          aim.oz,
          ndx,
          ndy,
          ndz,
          tActor.x,
          tActor.y,
          tActor.z,
          PLAYER_RADIUS * 1.25,
          PLAYER_HEIGHT * 1.25,
          obDist,
        );

        let dmg = 0;
        const endDist = actorHit.hit ? actorHit.distance : obDist;
        if (actorHit.hit) {
          const raw = spec.damage * 1.1 * (actorHit.headshot ? 1.35 : 1);
          dmg = Math.round(targetShielded ? raw * 0.45 : raw);
          tActor.hp = Math.max(0, tActor.hp - dmg);
        }

        shots.push({
          shooter: sColor,
          ox: aim.ox,
          oy: aim.oy,
          oz: aim.oz,
          dx: ndx,
          dy: ndy,
          dz: ndz,
          hit: actorHit.hit,
          headshot: actorHit.headshot,
          damage: dmg,
          hitX: aim.ox + ndx * endDist,
          hitY: aim.oy + ndy * endDist,
          hitZ: aim.oz + ndz * endDist,
        });
      }
    }

    const vitals = this.getVitals(room, now);
    if (shots && tActor.hp <= 0 && room.duel.move) {
      const attackerWon = sColor === room.duel.attacker.color;
      room.duelsFought += 1;
      if (sColor === 'white') room.whiteDuelsWon += 1;
      else room.blackDuelsWon += 1;

      const outcome = applyDuelOutcome(room.board, room.duel.move, attackerWon);
      room.board = outcome.nextBoard;

      if (outcome.winner) {
        room.status = 'gameover';
        room.phase = 'board';
        room.duel = null;
        room.winner = outcome.winner;
        room.winReason = outcome.winReason;
      } else {
        room.phase = 'board';
        room.duel = null;
        room.turn = room.turn === 'white' ? 'black' : 'white';
        if (getAllLegalMoves(room.board, room.turn).length === 0) {
          room.status = 'gameover';
          room.winner = room.turn === 'white' ? 'black' : 'white';
          room.winReason = `${room.turn === 'white' ? 'White' : 'Black'} has no legal moves remaining.`;
        }
      }

      return {
        ok: true,
        shots,
        duelVitals: vitals,
        duelEnded: {
          winnerColor: sColor,
          attackerWon,
          snapshot: this.toSnapshot(room),
        },
      };
    }

    return {
      ok: true,
      shots,
      duelVitals: vitals,
    };
  }

  private getVitals(room: ServerRoom, now = Date.now()) {
    const whiteP = room.players.find((p) => p.color === 'white');
    const blackP = room.players.find((p) => p.color === 'black');
    const whiteActive = whiteP ? now < whiteP.abilityActiveUntil : false;
    const blackActive = blackP ? now < blackP.abilityActiveUntil : false;
    if (room.duel) {
      room.duel.white.abilityActive = whiteActive;
      room.duel.black.abilityActive = blackActive;
    }
    return {
      whiteHp: Math.round(room.duel?.white.hp ?? 0),
      blackHp: Math.round(room.duel?.black.hp ?? 0),
      whiteAmmo: room.duel?.white.ammo ?? 0,
      blackAmmo: room.duel?.black.ammo ?? 0,
      whiteAbilityActive: whiteActive,
      blackAbilityActive: blackActive,
    };
  }

  public handleFire(
    code: string,
    playerId: string,
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    now = Date.now(),
  ): {
    accepted: boolean;
    shots: ShotOutcome[];
    vitals?: ReturnType<MultiplayerEngine['getVitals']>;
    duelEnded?: {
      winnerColor: PieceColor;
      attackerWon: boolean;
      snapshot: RoomSnapshot;
    };
  } {
    const room = this.rooms.get(code);
    if (!room || room.phase !== 'duel' || !room.duel) {
      return { accepted: false, shots: [] };
    }
    const shooter = room.players.find((p) => p.id === playerId);
    if (!shooter) return { accepted: false, shots: [] };

    const sColor = shooter.color;
    const tColor: PieceColor = sColor === 'white' ? 'black' : 'white';
    const sActor = sColor === 'white' ? room.duel.white : room.duel.black;
    const tActor = tColor === 'white' ? room.duel.white : room.duel.black;
    const sType = sColor === 'white' ? room.duel.whiteType : room.duel.blackType;
    const tType = tColor === 'white' ? room.duel.whiteType : room.duel.blackType;
    const sSpec = CLASS_SPECS[sType];
    const targetPlayer = room.players.find((p) => p.color === tColor);

    if (now < shooter.reloadUntil) {
      return { accepted: false, shots: [] };
    }
    if (now - shooter.lastFireTime < sSpec.fireInterval * 700) {
      return { accepted: false, shots: [] };
    }
    if (sActor.ammo <= 0) {
      shooter.reloadUntil = now + sSpec.reloadTime * 1000;
      sActor.ammo = sSpec.magSize;
      return { accepted: false, shots: [] };
    }

    shooter.lastFireTime = now;
    sActor.ammo = Math.max(0, sActor.ammo - 1);
    if (sActor.ammo === 0) {
      shooter.reloadUntil = now + sSpec.reloadTime * 1000;
      sActor.ammo = sSpec.magSize;
    }

    const len = Math.max(1e-5, Math.hypot(dx, dy, dz));
    const ndx = dx / len;
    const ndy = dy / len;
    const ndz = dz / len;

    const targetShielded =
      tType === 'rook' && targetPlayer && now < targetPlayer.abilityActiveUntil;

    const shots: ShotOutcome[] = [];
    for (let i = 0; i < sSpec.pellets; i++) {
      const spreadX =
        sSpec.pellets > 1 ? (Math.random() - 0.5) * sSpec.spreadRad * 2 : 0;
      const spreadY =
        sSpec.pellets > 1 ? (Math.random() - 0.5) * sSpec.spreadRad * 2 : 0;
      const rLen = Math.hypot(ndx + spreadX, ndy + spreadY, ndz);
      const rdx = (ndx + spreadX) / rLen;
      const rdy = (ndy + spreadY) / rLen;
      const rdz = ndz / rLen;

      const obDist = raycastObstacles(
        ox,
        oy,
        oz,
        rdx,
        rdy,
        rdz,
        sSpec.range,
        ARENA_OBSTACLES,
      );
      const actorHit = raycastActorHitbox(
        ox,
        oy,
        oz,
        rdx,
        rdy,
        rdz,
        tActor.x,
        tActor.y,
        tActor.z,
        PLAYER_RADIUS * 1.25,
        PLAYER_HEIGHT * 1.25,
        obDist,
      );

      let dmg = 0;
      const endDist = actorHit.hit ? actorHit.distance : obDist;
      if (actorHit.hit) {
        const raw = sSpec.damage * (actorHit.headshot ? 1.35 : 1);
        dmg = Math.round(targetShielded ? raw * 0.45 : raw);
        tActor.hp = Math.max(0, tActor.hp - dmg);
      }

      shots.push({
        shooter: sColor,
        ox,
        oy,
        oz,
        dx: rdx,
        dy: rdy,
        dz: rdz,
        hit: actorHit.hit,
        headshot: actorHit.headshot,
        damage: dmg,
        hitX: ox + rdx * endDist,
        hitY: oy + rdy * endDist,
        hitZ: oz + rdz * endDist,
      });
    }

    const vitals = this.getVitals(room, now);

    if (tActor.hp <= 0 && room.duel.move) {
      const attackerWon = sColor === room.duel.attacker.color;
      room.duelsFought += 1;
      if (sColor === 'white') room.whiteDuelsWon += 1;
      else room.blackDuelsWon += 1;

      const outcome = applyDuelOutcome(room.board, room.duel.move, attackerWon);
      room.board = outcome.nextBoard;

      if (outcome.winner) {
        room.status = 'gameover';
        room.phase = 'board';
        room.duel = null;
        room.winner = outcome.winner;
        room.winReason = outcome.winReason;
      } else {
        room.phase = 'board';
        room.duel = null;
        room.turn = room.turn === 'white' ? 'black' : 'white';
        if (getAllLegalMoves(room.board, room.turn).length === 0) {
          room.status = 'gameover';
          room.winner = room.turn === 'white' ? 'black' : 'white';
          room.winReason = `${room.turn === 'white' ? 'White' : 'Black'} has no legal moves remaining.`;
        }
      }

      return {
        accepted: true,
        shots,
        vitals,
        duelEnded: {
          winnerColor: sColor,
          attackerWon,
          snapshot: this.toSnapshot(room),
        },
      };
    }

    return { accepted: true, shots, vitals };
  }
}
