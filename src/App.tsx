import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardHud } from './components/BoardHud';
import { DuelHud } from './components/DuelHud';
import { MultiplayerLobbyModal } from './components/MultiplayerLobbyModal';
import { StatusModal } from './components/StatusModal';
import { TitleOverlay } from './components/TitleOverlay';
import { GameSceneController } from './engine/GameSceneController';
import {
  applyDuelOutcome,
  applyQuietMove,
  chooseAiMove,
  countPieces,
  createInitialBoard,
  getAllLegalMoves,
  getLegalMovesForSquare,
  isKingInCheck,
} from './game/chess';
import type { RoomSnapshot, ServerWsMessage } from './game/multiplayerTypes';
import type {
  AppState,
  BoardGrid,
  BoardHudSnapshot,
  ChessMove,
  Difficulty,
  DuelConfig,
  DuelHudSnapshot,
  GameMode,
  MatchSummary,
  PieceColor,
  PieceType,
  SquareCoord,
} from './game/types';
import {
  type ConnectionStatus,
  MultiplayerClient,
} from './net/multiplayerClient';

const QUICK_DUEL_MATCHUPS: [PieceType, PieceType][] = [
  ['knight', 'bishop'],
  ['queen', 'rook'],
  ['bishop', 'knight'],
  ['king', 'king'],
  ['rook', 'queen'],
  ['pawn', 'pawn'],
];

function computeBoardHud(
  board: BoardGrid,
  turn: PieceColor,
  selected: SquareCoord | null,
  legalMoves: ChessMove[],
  lastNotation: string | null,
  moveCount: number,
  aiThinking: boolean,
  mpRoom: RoomSnapshot | null = null,
  myColor: PieceColor | null = null,
): BoardHudSnapshot {
  const counts = countPieces(board);
  const selectedPiece = selected ? board[selected.row]?.[selected.col] ?? null : null;
  const captureMoveCount = legalMoves.filter((m) => m.captured !== null).length;
  const opponent =
    mpRoom && myColor
      ? mpRoom.players.find((p) => p.color !== myColor)
      : undefined;

  return {
    turn,
    selectedSquare: selected,
    selectedPiece,
    legalMoveCount: legalMoves.length,
    captureMoveCount,
    whiteInCheck: isKingInCheck(board, 'white'),
    blackInCheck: isKingInCheck(board, 'black'),
    whitePiecesLeft: counts.white,
    blackPiecesLeft: counts.black,
    lastMoveNotation: lastNotation,
    moveCount,
    aiThinking,
    isMultiplayer: Boolean(mpRoom),
    roomCode: mpRoom?.code,
    myColor: myColor ?? undefined,
    opponentName: opponent?.name,
    opponentConnected: opponent ? opponent.connected : true,
  };
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<GameSceneController | null>(null);
  const mpClientRef = useRef<MultiplayerClient | null>(null);

  const [appState, setAppState] = useState<AppState>('title');
  const [phase, setPhase] = useState<'board' | 'duel'>('board');
  const [mode, setMode] = useState<GameMode>('match');
  const [difficulty, setDifficulty] = useState<Difficulty>('tactician');
  const [muted, setMuted] = useState(false);

  // Multiplayer UI state
  const [mpLobbyOpen, setMpLobbyOpen] = useState(false);
  const [mpConnectionStatus, setMpConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [mpRoom, setMpRoom] = useState<RoomSnapshot | null>(null);
  const [mpColor, setMpColor] = useState<PieceColor | null>(null);
  const [mpPlayerName, setMpPlayerName] = useState('Challenger');
  const [mpError, setMpError] = useState<string | null>(null);
  const [initialInviteCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room')?.trim().toUpperCase() || '';
  });

  const [boardHud, setBoardHud] = useState<BoardHudSnapshot>(() =>
    computeBoardHud(createInitialBoard(), 'white', null, [], null, 0, false),
  );
  const [duelHud, setDuelHud] = useState<DuelHudSnapshot | null>(null);
  const [summary, setSummary] = useState<MatchSummary | null>(null);

  // Mutable simulation state stored in refs so 3D canvas never remounts
  const appStateRef = useRef<AppState>('title');
  const phaseRef = useRef<'board' | 'duel'>('board');
  const modeRef = useRef<GameMode>('match');
  const difficultyRef = useRef<Difficulty>('tactician');
  const boardRef = useRef<BoardGrid>(createInitialBoard());
  const turnRef = useRef<PieceColor>('white');
  const selectedRef = useRef<SquareCoord | null>(null);
  const legalMovesRef = useRef<ChessMove[]>([]);
  const activeDuelRef = useRef<DuelConfig | null>(null);
  const lastNotationRef = useRef<string | null>(null);
  const moveCountRef = useRef(0);
  const duelsWonRef = useRef(0);
  const duelsFoughtRef = useRef(0);
  const shotsFiredRef = useRef(0);
  const shotsHitRef = useRef(0);
  const startTimeRef = useRef(Date.now());
  const aiThinkingRef = useRef(false);
  const aiTimerRef = useRef<number | null>(null);
  const quickMatchupIdxRef = useRef(0);

  const mpLobbyOpenRef = useRef(false);
  const mpRoomRef = useRef<RoomSnapshot | null>(null);
  const mpColorRef = useRef<PieceColor | null>(null);
  const mpPlayerIdRef = useRef<string | null>(null);
  const mpPlayerNameRef = useRef('Challenger');
  const pendingMpDuelRoomRef = useRef<RoomSnapshot | null>(null);
  mpPlayerNameRef.current = mpPlayerName;
  mpLobbyOpenRef.current = mpLobbyOpen;

  const syncBodyAttributes = useCallback(
    (nextState: AppState, nextPhase: 'board' | 'duel') => {
      document.body.dataset.state = nextState;
      document.body.dataset.phase = nextPhase;
    },
    [],
  );

  const refreshBoardVisuals = useCallback(() => {
    const ctrl = controllerRef.current;
    if (ctrl) {
      ctrl.syncBoardState(
        boardRef.current,
        selectedRef.current,
        legalMovesRef.current,
      );
    }
    setBoardHud(
      computeBoardHud(
        boardRef.current,
        turnRef.current,
        selectedRef.current,
        legalMovesRef.current,
        lastNotationRef.current,
        moveCountRef.current,
        aiThinkingRef.current,
        mpRoomRef.current,
        mpColorRef.current,
      ),
    );
  }, []);

  const finishMatch = useCallback(
    (winner: PieceColor, reason: string) => {
      if (aiTimerRef.current) {
        window.clearTimeout(aiTimerRef.current);
        aiTimerRef.current = null;
      }
      aiThinkingRef.current = false;

      const isMp = mpRoomRef.current !== null;
      const finalSummary: MatchSummary = {
        winner,
        reason,
        mode: modeRef.current,
        movesPlayed: moveCountRef.current,
        duelsWon: duelsWonRef.current,
        duelsFought: duelsFoughtRef.current,
        elapsedSeconds: (Date.now() - startTimeRef.current) / 1000,
        shotsFired: shotsFiredRef.current,
        shotsHit: shotsHitRef.current,
        isMultiplayer: isMp,
        myColor: mpColorRef.current ?? undefined,
      };
      setSummary(finalSummary);
      appStateRef.current = 'gameover';
      setAppState('gameover');
      controllerRef.current?.setAppState('gameover');
      syncBodyAttributes('gameover', phaseRef.current);
    },
    [syncBodyAttributes],
  );

  const beginDuel = useCallback(
    (config: DuelConfig) => {
      activeDuelRef.current = config;
      phaseRef.current = 'duel';
      setPhase('duel');
      syncBodyAttributes(appStateRef.current, 'duel');
      controllerRef.current?.startDuel(config);
    },
    [syncBodyAttributes],
  );

  const applyRoomSnapshot = useCallback(
    (room: RoomSnapshot, isInitialJoin = false) => {
      const prevRoom = mpRoomRef.current;
      mpRoomRef.current = room;
      setMpRoom(room);
      setMpError(null);

      const myColorVal = mpColorRef.current ?? 'white';

      if (room.status === 'waiting') {
        if (appStateRef.current !== 'title') {
          // Opponent left -> return cleanly to waiting lobby
          boardRef.current = room.board;
          selectedRef.current = null;
          legalMovesRef.current = [];
          activeDuelRef.current = null;
          phaseRef.current = 'board';
          setPhase('board');
          appStateRef.current = 'title';
          setAppState('title');
          controllerRef.current?.startBoardPhase();
          controllerRef.current?.setAppState('title');
          syncBodyAttributes('title', 'board');
        }
        setMpLobbyOpen(true);
        return;
      }

      if (room.status === 'playing') {
        setMpLobbyOpen(false);
        const enteringPlaying =
          !prevRoom ||
          prevRoom.status !== 'playing' ||
          isInitialJoin ||
          appStateRef.current !== 'playing';

        if (enteringPlaying) {
          modeRef.current = 'match';
          setMode('match');
          startTimeRef.current = Date.now();
          shotsFiredRef.current = 0;
          shotsHitRef.current = 0;
          setSummary(null);
          controllerRef.current?.setBoardFlipped(myColorVal === 'black');
        }

        const prevMoveCount = moveCountRef.current;
        boardRef.current = room.board;
        turnRef.current = room.turn;
        lastNotationRef.current = room.lastMoveNotation;
        moveCountRef.current = room.moveCount;
        duelsFoughtRef.current = room.duelsFought;
        duelsWonRef.current =
          myColorVal === 'white' ? room.whiteDuelsWon : room.blackDuelsWon;

        if (room.phase === 'board') {
          pendingMpDuelRoomRef.current = null;
          activeDuelRef.current = null;
          selectedRef.current = null;
          legalMovesRef.current = [];

          if (phaseRef.current !== 'board' || enteringPlaying) {
            phaseRef.current = 'board';
            setPhase('board');
            appStateRef.current = 'playing';
            setAppState('playing');
            controllerRef.current?.startBoardPhase();
            controllerRef.current?.setAppState('playing');
            syncBodyAttributes('playing', 'board');
          } else if (room.moveCount > prevMoveCount) {
            controllerRef.current?.audio.playPieceMove();
          }
          refreshBoardVisuals();
          return;
        }

        if (room.phase === 'duel' && room.duel) {
          if (phaseRef.current !== 'duel' || enteringPlaying) {
            appStateRef.current = 'playing';
            setAppState('playing');
            controllerRef.current?.setAppState('playing');
            beginDuel({
              attacker: room.duel.attacker,
              defender: room.duel.defender,
              move: room.duel.move,
              playerColor: myColorVal,
              isPlayerAttacker: room.duel.attacker.color === myColorVal,
              isMultiplayer: true,
            });
          }
          return;
        }
      }

      if (room.status === 'gameover') {
        setMpLobbyOpen(false);
        boardRef.current = room.board;
        moveCountRef.current = room.moveCount;
        duelsFoughtRef.current = room.duelsFought;
        duelsWonRef.current =
          myColorVal === 'white' ? room.whiteDuelsWon : room.blackDuelsWon;
        if (phaseRef.current !== 'board') {
          phaseRef.current = 'board';
          setPhase('board');
          controllerRef.current?.startBoardPhase();
        }
        refreshBoardVisuals();
        if (appStateRef.current !== 'gameover') {
          finishMatch(
            room.winner ?? 'white',
            room.winReason ?? 'Match concluded.',
          );
        }
      }
    },
    [beginDuel, finishMatch, refreshBoardVisuals, syncBodyAttributes],
  );

  const handleServerMessage = useCallback(
    (msg: ServerWsMessage) => {
      switch (msg.type) {
        case 'room:joined': {
          mpColorRef.current = msg.color;
          mpPlayerIdRef.current = msg.playerId;
          setMpColor(msg.color);
          setMpError(null);
          mpClientRef.current?.setSessionInfo(
            msg.code,
            msg.playerId,
            mpPlayerNameRef.current,
          );
          try {
            window.history.replaceState(null, '', `/?room=${msg.code}`);
          } catch {
            // Ignore restricted history state
          }
          applyRoomSnapshot(msg.room, true);
          break;
        }
        case 'room:state': {
          applyRoomSnapshot(msg.room);
          break;
        }
        case 'room:error': {
          setMpError(msg.message);
          break;
        }
        case 'duel:remote_pose': {
          if (msg.color !== mpColorRef.current) {
            controllerRef.current?.applyRemotePose(
              msg.x,
              msg.y,
              msg.z,
              msg.yaw,
              msg.pitch,
            );
          }
          break;
        }
        case 'duel:shot': {
          controllerRef.current?.applyServerShot(msg);
          break;
        }
        case 'duel:vitals': {
          controllerRef.current?.applyServerVitals(msg);
          break;
        }
        case 'duel:ended': {
          pendingMpDuelRoomRef.current = msg.room;
          const playerWon = msg.winnerColor === mpColorRef.current;
          controllerRef.current?.applyServerDuelEnded(playerWon);
          break;
        }
      }
    },
    [applyRoomSnapshot],
  );

  const handleServerMessageRef = useRef(handleServerMessage);
  handleServerMessageRef.current = handleServerMessage;

  const ensureMpClient = useCallback((): MultiplayerClient => {
    if (!mpClientRef.current) {
      mpClientRef.current = new MultiplayerClient(
        (msg) => handleServerMessageRef.current(msg),
        (status) => setMpConnectionStatus(status),
      );
    }
    mpClientRef.current.connect();
    return mpClientRef.current;
  }, []);

  const scheduleAiTurn = useCallback(() => {
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    aiThinkingRef.current = true;
    refreshBoardVisuals();

    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      if (
        appStateRef.current !== 'playing' ||
        phaseRef.current !== 'board' ||
        turnRef.current !== 'black' ||
        mpRoomRef.current !== null
      ) {
        aiThinkingRef.current = false;
        return;
      }

      const aiMove = chooseAiMove(
        boardRef.current,
        'black',
        difficultyRef.current,
      );
      aiThinkingRef.current = false;

      if (!aiMove) {
        finishMatch('white', 'Black has no legal moves remaining.');
        return;
      }

      moveCountRef.current += 1;
      lastNotationRef.current = aiMove.notation;

      if (aiMove.captured) {
        // Black challenges a White piece -> FPS Duel (Player defends as White!)
        beginDuel({
          attacker: aiMove.piece,
          defender: aiMove.captured,
          move: aiMove,
          playerColor: 'white',
          isPlayerAttacker: false,
        });
      } else {
        boardRef.current = applyQuietMove(boardRef.current, aiMove);
        controllerRef.current?.audio.playPieceMove();
        turnRef.current = 'white';
        refreshBoardVisuals();

        if (getAllLegalMoves(boardRef.current, 'white').length === 0) {
          finishMatch('black', 'White has no legal moves remaining.');
        }
      }
    }, 520);
  }, [beginDuel, finishMatch, refreshBoardVisuals]);

  const handleSquareClick = useCallback(
    (coord: SquareCoord) => {
      if (appStateRef.current !== 'playing' || phaseRef.current !== 'board') {
        return;
      }

      const isMp = mpRoomRef.current !== null;
      const myTurnColor: PieceColor = isMp
        ? (mpColorRef.current ?? 'white')
        : 'white';

      if (turnRef.current !== myTurnColor || (!isMp && aiThinkingRef.current)) {
        return;
      }

      const board = boardRef.current;
      const clickedPiece = board[coord.row]?.[coord.col] ?? null;

      // Check if clicking one of currently highlighted legal move targets
      const targetMove = legalMovesRef.current.find(
        (m) => m.to.row === coord.row && m.to.col === coord.col,
      );

      if (targetMove) {
        selectedRef.current = null;
        legalMovesRef.current = [];

        if (isMp) {
          mpClientRef.current?.send({
            type: 'chess:move',
            from: targetMove.from,
            to: targetMove.to,
          });
          refreshBoardVisuals();
          return;
        }

        moveCountRef.current += 1;
        lastNotationRef.current = targetMove.notation;

        if (targetMove.captured) {
          beginDuel({
            attacker: targetMove.piece,
            defender: targetMove.captured,
            move: targetMove,
            playerColor: 'white',
            isPlayerAttacker: true,
          });
        } else {
          boardRef.current = applyQuietMove(board, targetMove);
          controllerRef.current?.audio.playPieceMove();
          turnRef.current = 'black';
          refreshBoardVisuals();
          scheduleAiTurn();
        }
        return;
      }

      // Select one of our own pieces
      if (clickedPiece && clickedPiece.color === myTurnColor) {
        selectedRef.current = { ...coord };
        legalMovesRef.current = getLegalMovesForSquare(board, coord);
        controllerRef.current?.audio.playSelect();
        refreshBoardVisuals();
      } else {
        selectedRef.current = null;
        legalMovesRef.current = [];
        refreshBoardVisuals();
      }
    },
    [beginDuel, refreshBoardVisuals, scheduleAiTurn],
  );

  const handleDuelComplete = useCallback(
    (
      playerWon: boolean,
      stats: { shotsFired: number; shotsHit: number },
    ) => {
      shotsFiredRef.current += stats.shotsFired;
      shotsHitRef.current += stats.shotsHit;

      const duel = activeDuelRef.current;
      activeDuelRef.current = null;

      if (mpRoomRef.current !== null) {
        const pendingRoom = pendingMpDuelRoomRef.current;
        pendingMpDuelRoomRef.current = null;
        if (pendingRoom) {
          applyRoomSnapshot(pendingRoom);
        } else {
          mpClientRef.current?.send({ type: 'room:sync' });
        }
        return;
      }

      duelsFoughtRef.current += 1;
      if (playerWon) duelsWonRef.current += 1;

      if (modeRef.current === 'quickduel' || !duel || !duel.move) {
        finishMatch(
          playerWon ? 'white' : 'black',
          playerWon
            ? 'You vanquished the opposing champion in arena combat.'
            : 'Your champion fell in arena combat.',
        );
        return;
      }

      const attackerWon = duel.isPlayerAttacker ? playerWon : !playerWon;
      const result = applyDuelOutcome(
        boardRef.current,
        duel.move,
        attackerWon,
      );
      boardRef.current = result.nextBoard;

      if (result.winner) {
        finishMatch(
          result.winner,
          result.winReason ?? 'The opposing King was eliminated.',
        );
        return;
      }

      // Return to Tactical Board
      phaseRef.current = 'board';
      setPhase('board');
      controllerRef.current?.startBoardPhase();
      syncBodyAttributes('playing', 'board');

      const nextTurn: PieceColor = duel.isPlayerAttacker ? 'black' : 'white';
      turnRef.current = nextTurn;
      selectedRef.current = null;
      legalMovesRef.current = [];
      refreshBoardVisuals();

      if (nextTurn === 'black') {
        scheduleAiTurn();
      } else if (getAllLegalMoves(boardRef.current, 'white').length === 0) {
        finishMatch('black', 'White has no legal moves remaining.');
      }
    },
    [applyRoomSnapshot, finishMatch, refreshBoardVisuals, scheduleAiTurn, syncBodyAttributes],
  );

  const startMatch = useCallback(() => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    mpRoomRef.current = null;
    mpColorRef.current = null;
    setMpRoom(null);
    setMpColor(null);
    setMpLobbyOpen(false);

    modeRef.current = 'match';
    setMode('match');
    boardRef.current = createInitialBoard();
    turnRef.current = 'white';
    selectedRef.current = null;
    legalMovesRef.current = [];
    activeDuelRef.current = null;
    lastNotationRef.current = null;
    moveCountRef.current = 0;
    duelsWonRef.current = 0;
    duelsFoughtRef.current = 0;
    shotsFiredRef.current = 0;
    shotsHitRef.current = 0;
    startTimeRef.current = Date.now();
    aiThinkingRef.current = false;
    setSummary(null);

    phaseRef.current = 'board';
    setPhase('board');
    appStateRef.current = 'playing';
    setAppState('playing');

    controllerRef.current?.setBoardFlipped(false);
    controllerRef.current?.setDifficulty(difficultyRef.current);
    controllerRef.current?.startBoardPhase();
    controllerRef.current?.setAppState('playing');
    syncBodyAttributes('playing', 'board');
    refreshBoardVisuals();
  }, [refreshBoardVisuals, syncBodyAttributes]);

  const startQuickDuel = useCallback(() => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    mpRoomRef.current = null;
    mpColorRef.current = null;
    setMpRoom(null);
    setMpColor(null);
    setMpLobbyOpen(false);

    modeRef.current = 'quickduel';
    setMode('quickduel');
    boardRef.current = createInitialBoard();
    moveCountRef.current = 0;
    duelsWonRef.current = 0;
    duelsFoughtRef.current = 0;
    shotsFiredRef.current = 0;
    shotsHitRef.current = 0;
    startTimeRef.current = Date.now();
    setSummary(null);

    const [pType, eType] =
      QUICK_DUEL_MATCHUPS[
        quickMatchupIdxRef.current % QUICK_DUEL_MATCHUPS.length
      ];
    quickMatchupIdxRef.current += 1;

    appStateRef.current = 'playing';
    setAppState('playing');
    controllerRef.current?.setDifficulty(difficultyRef.current);
    controllerRef.current?.setAppState('playing');

    beginDuel({
      attacker: {
        id: `qd-w-${pType}`,
        type: pType,
        color: 'white',
        hasMoved: true,
      },
      defender: {
        id: `qd-b-${eType}`,
        type: eType,
        color: 'black',
        hasMoved: true,
      },
      move: null,
      playerColor: 'white',
      isPlayerAttacker: true,
    });
  }, [beginDuel]);

  const handleRestart = useCallback(() => {
    if (mpRoomRef.current !== null) return;
    if (modeRef.current === 'quickduel') {
      startQuickDuel();
    } else {
      startMatch();
    }
  }, [startMatch, startQuickDuel]);

  const handlePauseToggle = useCallback(() => {
    if (appStateRef.current === 'playing') {
      appStateRef.current = 'paused';
      setAppState('paused');
      controllerRef.current?.setAppState('paused');
      syncBodyAttributes('paused', phaseRef.current);
    } else if (appStateRef.current === 'paused') {
      appStateRef.current = 'playing';
      setAppState('playing');
      controllerRef.current?.setAppState('playing');
      syncBodyAttributes('playing', phaseRef.current);
      if (
        mpRoomRef.current === null &&
        phaseRef.current === 'board' &&
        turnRef.current === 'black'
      ) {
        scheduleAiTurn();
      }
    }
  }, [scheduleAiTurn, syncBodyAttributes]);

  const handleLeaveMultiplayer = useCallback(() => {
    if (mpClientRef.current) {
      mpClientRef.current.send({ type: 'room:leave' });
      mpClientRef.current.disconnect();
    }
    mpRoomRef.current = null;
    mpColorRef.current = null;
    mpPlayerIdRef.current = null;
    pendingMpDuelRoomRef.current = null;
    setMpRoom(null);
    setMpColor(null);
    setMpError(null);
    try {
      if (window.location.search.includes('room=')) {
        window.history.replaceState(null, '', '/');
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleReturnTitle = useCallback(() => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    aiThinkingRef.current = false;
    if (mpRoomRef.current) {
      handleLeaveMultiplayer();
    }
    setMpLobbyOpen(false);
    boardRef.current = createInitialBoard();
    selectedRef.current = null;
    legalMovesRef.current = [];
    activeDuelRef.current = null;
    phaseRef.current = 'board';
    setPhase('board');
    appStateRef.current = 'title';
    setAppState('title');
    controllerRef.current?.setBoardFlipped(false);
    controllerRef.current?.startBoardPhase();
    controllerRef.current?.setAppState('title');
    syncBodyAttributes('title', 'board');
    refreshBoardVisuals();
  }, [handleLeaveMultiplayer, refreshBoardVisuals, syncBodyAttributes]);

  const handleToggleMute = useCallback(() => {
    if (!controllerRef.current) return;
    const nextMuted = controllerRef.current.audio.toggleMute();
    setMuted(nextMuted);
  }, []);

  const handleDifficultyChange = useCallback((nextDiff: Difficulty) => {
    difficultyRef.current = nextDiff;
    setDifficulty(nextDiff);
    controllerRef.current?.setDifficulty(nextDiff);
  }, []);

  const handleOpenMultiplayer = useCallback(() => {
    setMpError(null);
    setMpLobbyOpen(true);
    ensureMpClient();
  }, [ensureMpClient]);

  const handleCreateRoom = useCallback(() => {
    setMpError(null);
    const client = ensureMpClient();
    client.send({
      type: 'room:create',
      playerName: mpPlayerNameRef.current,
      isPublic: false,
    });
  }, [ensureMpClient]);

  const handleJoinRoom = useCallback(
    (code: string) => {
      setMpError(null);
      const client = ensureMpClient();
      client.send({
        type: 'room:join',
        code: code.trim().toUpperCase(),
        playerName: mpPlayerNameRef.current,
      });
    },
    [ensureMpClient],
  );

  const handleQuickMatch = useCallback(() => {
    setMpError(null);
    const client = ensureMpClient();
    client.send({
      type: 'room:quickmatch',
      playerName: mpPlayerNameRef.current,
    });
  }, [ensureMpClient]);

  const handleRematch = useCallback(() => {
    mpClientRef.current?.send({ type: 'room:rematch' });
  }, []);

  // Stable refs for scene callbacks
  const callbacksRef = useRef({
    onSquareClick: handleSquareClick,
    onDuelHudUpdate: setDuelHud,
    onDuelComplete: handleDuelComplete,
    onPauseRequest: handlePauseToggle,
  });
  callbacksRef.current = {
    onSquareClick: handleSquareClick,
    onDuelHudUpdate: setDuelHud,
    onDuelComplete: handleDuelComplete,
    onPauseRequest: handlePauseToggle,
  };

  // Mount Three.js scene once
  useEffect(() => {
    const el = canvasMountRef.current;
    if (!el) return;

    const controller = new GameSceneController(el, {
      onSquareClick: (coord) => callbacksRef.current.onSquareClick(coord),
      onDuelHudUpdate: (snap) => callbacksRef.current.onDuelHudUpdate(snap),
      onDuelComplete: (won, stats) =>
        callbacksRef.current.onDuelComplete(won, stats),
      onPauseRequest: () => callbacksRef.current.onPauseRequest(),
      onMultiplayerPose: (x, y, z, yaw, pitch) => {
        mpClientRef.current?.send({
          type: 'duel:pose',
          x,
          y,
          z,
          yaw,
          pitch,
        });
      },
      onMultiplayerFire: (ox, oy, oz, dx, dy, dz) => {
        mpClientRef.current?.send({
          type: 'duel:fire',
          ox,
          oy,
          oz,
          dx,
          dy,
          dz,
        });
      },
      onMultiplayerAbility: (aim) => {
        mpClientRef.current?.send({
          type: 'duel:ability',
          ...(aim ?? {}),
        });
      },
      onMultiplayerReload: () => {
        mpClientRef.current?.send({ type: 'duel:reload' });
      },
    });
    controllerRef.current = controller;
    controller.syncBoardState(boardRef.current, null, []);
    syncBodyAttributes('title', 'board');

    // Support ?autostart=1, ?quickduel=1, and ?room=CODE query params
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('room')?.trim().toUpperCase();
    if (params.get('quickduel') === '1') {
      startQuickDuel();
    } else if (params.get('autostart') === '1') {
      startMatch();
    } else if (inviteCode) {
      setMpLobbyOpen(true);
      const client = ensureMpClient();
      client.send({
        type: 'room:join',
        code: inviteCode,
        playerName: 'Challenger',
      });
    }

    return () => {
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
      mpClientRef.current?.disconnect();
      mpClientRef.current = null;
      controller.dispose();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts (Title start, Pause, Mute, Board Restart)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        if (e.code === 'Escape' && mpLobbyOpenRef.current) {
          setMpLobbyOpen(false);
        }
        return;
      }

      if (appStateRef.current === 'title') {
        if (mpLobbyOpenRef.current) {
          if (e.code === 'Escape') {
            setMpLobbyOpen(false);
          }
          return;
        }
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          startMatch();
        }
        return;
      }

      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (
          appStateRef.current === 'playing' ||
          appStateRef.current === 'paused'
        ) {
          e.preventDefault();
          handlePauseToggle();
        }
        return;
      }

      if (e.code === 'KeyM') {
        handleToggleMute();
        return;
      }

      if (
        e.code === 'KeyR' &&
        appStateRef.current === 'playing' &&
        phaseRef.current === 'board' &&
        mpRoomRef.current === null
      ) {
        handleRestart();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePauseToggle, handleRestart, handleToggleMute, startMatch]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0b0d12]">
      {/* Dedicated isolated WebGL canvas container */}
      <div
        ref={canvasMountRef}
        className="fixed inset-0 z-0"
        data-testid="scene-container"
      />

      {appState === 'title' && !mpLobbyOpen && (
        <TitleOverlay
          difficulty={difficulty}
          onSelectDifficulty={handleDifficultyChange}
          onStartMatch={startMatch}
          onOpenMultiplayer={handleOpenMultiplayer}
          onQuickDuel={startQuickDuel}
        />
      )}

      {appState === 'title' && mpLobbyOpen && (
        <MultiplayerLobbyModal
          connectionStatus={mpConnectionStatus}
          room={mpRoom}
          playerName={mpPlayerName}
          error={mpError}
          initialCode={initialInviteCode}
          onPlayerNameChange={setMpPlayerName}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onQuickMatch={handleQuickMatch}
          onLeaveRoom={handleLeaveMultiplayer}
          onClose={() => {
            if (mpRoomRef.current) {
              handleLeaveMultiplayer();
            }
            setMpLobbyOpen(false);
          }}
        />
      )}

      {appState === 'playing' && phase === 'board' && (
        <BoardHud
          hud={boardHud}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handlePauseToggle}
          onRestart={handleRestart}
          onFlipCamera={() => controllerRef.current?.flipBoardCamera()}
        />
      )}

      {appState === 'playing' && phase === 'duel' && duelHud && (
        <DuelHud
          hud={duelHud}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handlePauseToggle}
        />
      )}

      {(appState === 'paused' || appState === 'gameover') && (
        <StatusModal
          state={appState}
          summary={summary}
          isMultiplayer={mpRoom !== null}
          onResume={handlePauseToggle}
          onRestart={handleRestart}
          onRematch={handleRematch}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}
