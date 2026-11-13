import type { AppState, MatchSummary } from '../game/types';

interface StatusModalProps {
  state: Extract<AppState, 'paused' | 'gameover'>;
  summary: MatchSummary | null;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export function StatusModal({
  state,
  summary,
  onResume,
  onRestart,
  onReturnTitle,
}: StatusModalProps) {
  if (state === 'paused') {
    return (
      <div
        className="fixed inset-0 z-20 flex items-center justify-center bg-[#090b10]/82 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Game Paused"
      >
        <div className="w-full max-w-sm rounded-xl bg-[#121622] border border-[#d4a853]/35 p-6 shadow-2xl">
          <h2 className="font-display text-2xl font-bold text-[#f3efe6] tracking-wide text-center">
            Match Paused
          </h2>
          <p className="text-xs text-[#9ca3af] text-center mt-1 mb-6">
            Press Esc or P to resume combat.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-2.5 px-4 rounded-lg bg-[#d4a853] hover:bg-[#e1b967] text-[#0b0d12] font-semibold text-sm cursor-pointer transition-colors"
            >
              Resume
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 px-4 rounded-lg bg-[#1c2233] hover:bg-[#252d42] text-[#f3efe6] border border-white/12 font-semibold text-sm cursor-pointer transition-colors"
            >
              Restart
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="w-full py-2.5 px-4 rounded-lg bg-transparent hover:bg-white/5 text-[#cbd5e1] border border-white/10 font-medium text-sm cursor-pointer transition-colors"
            >
              Title Screen
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isVictory = summary?.winner === 'white';
  const accuracy =
    summary && summary.shotsFired > 0
      ? Math.round((summary.shotsHit / summary.shotsFired) * 100)
      : 0;

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-[#090b10]/84 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Victory' : 'Defeat'}
    >
      <div className="w-full max-w-md rounded-xl bg-[#121622] border border-[#d4a853]/40 p-7 shadow-2xl">
        <div className="text-center">
          <div
            className={`text-xs font-semibold uppercase tracking-widest mb-1 ${
              isVictory ? 'text-[#d4a853]' : 'text-[#f87171]'
            }`}
          >
            {isVictory ? 'Crown Claimed' : 'Crown Shattered'}
          </div>
          <h2 className="font-display text-3xl font-bold text-[#f3efe6] tracking-wide">
            {isVictory ? 'Victory' : 'Defeat'}
          </h2>
          <p className="text-sm text-[#cbd5e1] mt-2">
            {summary?.reason ?? 'Match concluded.'}
          </p>
        </div>

        {/* 3 Tabular Stat Tiles */}
        <div className="grid grid-cols-3 gap-3 my-6">
          <div className="rounded-lg bg-[#191e2e] border border-white/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">
              {summary?.mode === 'quickduel' ? 'Accuracy' : 'Moves'}
            </div>
            <div className="font-mono-num text-xl font-bold text-[#f3efe6] mt-0.5">
              {summary?.mode === 'quickduel'
                ? `${accuracy}%`
                : (summary?.movesPlayed ?? 0)}
            </div>
          </div>
          <div className="rounded-lg bg-[#191e2e] border border-white/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">
              Duels Won
            </div>
            <div className="font-mono-num text-xl font-bold text-[#d4a853] mt-0.5">
              {summary?.duelsWon ?? 0}/{summary?.duelsFought ?? 0}
            </div>
          </div>
          <div className="rounded-lg bg-[#191e2e] border border-white/10 p-3 text-center">
            <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">
              Time
            </div>
            <div className="font-mono-num text-xl font-bold text-[#f3efe6] mt-0.5">
              {formatTime(summary?.elapsedSeconds ?? 0)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className="flex-1 py-2.5 px-4 rounded-lg bg-[#d4a853] hover:bg-[#e1b967] text-[#0b0d12] font-semibold text-sm cursor-pointer transition-colors"
          >
            Play Again
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="flex-1 py-2.5 px-4 rounded-lg bg-[#1c2233] hover:bg-[#252d42] text-[#f3efe6] border border-white/12 font-semibold text-sm cursor-pointer transition-colors"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
}
