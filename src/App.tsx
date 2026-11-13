import { useCallback, useEffect, useRef, useState } from 'react';
import { BoardHud } from './components/BoardHud';
import { DuelHud } from './components/DuelHud';
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
): BoardHudSnapshot {
  const counts = countPieces(board);
  const selectedPiece = selected ? board[selected.row]?.[selected.col] ?? null : null;
  const captureMoveCount = legalMoves.filter((m) => m.captured !== null).length;

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
  };
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<GameSceneController | null>(null);

  const [appState, setAppState] = useState<AppState>('title');
  const [phase, setPhase] = useState<'board' | 'duel'>('board');
  const [mode, setMode] = useState<GameMode>('match');
  const [difficulty, setDifficulty] = useState<Difficulty>('tactician');
  const [muted, setMuted] = useState(false);

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

  const scheduleAiTurn = useCallback(() => {
    if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
    aiThinkingRef.current = true;
    refreshBoardVisuals();

    aiTimerRef.current = window.setTimeout(() => {
      aiTimerRef.current = null;
      if (
        appStateRef.current !== 'playing' ||
        phaseRef.current !== 'board' ||
        turnRef.current !== 'black'
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
      if (
        appStateRef.current !== 'playing' ||
        phaseRef.current !== 'board' ||
        turnRef.current !== 'white' ||
        aiThinkingRef.current
      ) {
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

      // Select a White piece
      if (clickedPiece && clickedPiece.color === 'white') {
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
      duelsFoughtRef.current += 1;
      if (playerWon) duelsWonRef.current += 1;
      shotsFiredRef.current += stats.shotsFired;
      shotsHitRef.current += stats.shotsHit;

      const duel = activeDuelRef.current;
      activeDuelRef.current = null;

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
    [finishMatch, refreshBoardVisuals, scheduleAiTurn, syncBodyAttributes],
  );

  const startMatch = useCallback(() => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

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
      if (phaseRef.current === 'board' && turnRef.current === 'black') {
        scheduleAiTurn();
      }
    }
  }, [scheduleAiTurn, syncBodyAttributes]);

  const handleReturnTitle = useCallback(() => {
    if (aiTimerRef.current) {
      window.clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    aiThinkingRef.current = false;
    boardRef.current = createInitialBoard();
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
    refreshBoardVisuals();
  }, [refreshBoardVisuals, syncBodyAttributes]);

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
    });
    controllerRef.current = controller;
    controller.syncBoardState(boardRef.current, null, []);
    syncBodyAttributes('title', 'board');

    // Support ?autostart=1 and ?quickduel=1 query params
    const params = new URLSearchParams(window.location.search);
    if (params.get('quickduel') === '1') {
      startQuickDuel();
    } else if (params.get('autostart') === '1') {
      startMatch();
    }

    return () => {
      if (aiTimerRef.current) window.clearTimeout(aiTimerRef.current);
      controller.dispose();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts (Title start, Pause, Mute, Board Restart)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (appStateRef.current === 'title') {
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
        phaseRef.current === 'board'
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

      {appState === 'title' && (
        <TitleOverlay
          difficulty={difficulty}
          onSelectDifficulty={handleDifficultyChange}
          onStartMatch={startMatch}
          onQuickDuel={startQuickDuel}
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
          onResume={handlePauseToggle}
          onRestart={handleRestart}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}
