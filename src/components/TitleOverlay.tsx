import type { Difficulty } from '../game/types';

interface TitleOverlayProps {
  difficulty: Difficulty;
  onSelectDifficulty: (diff: Difficulty) => void;
  onStartMatch: () => void;
  onQuickDuel: () => void;
}

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'recruit', label: 'Recruit' },
  { id: 'tactician', label: 'Tactician' },
  { id: 'grandmaster', label: 'Grandmaster' },
];

export function TitleOverlay({
  difficulty,
  onSelectDifficulty,
  onStartMatch,
  onQuickDuel,
}: TitleOverlayProps) {
  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-12">
      {/* Subtle left scrim for 4.5:1+ contrast without hiding the 3D chessboard */}
      <div
        aria-hidden="true"
        className="fixed inset-y-0 left-0 w-full max-w-2xl bg-gradient-to-r from-[#0b0d12]/88 via-[#0b0d12]/55 to-transparent pointer-events-none"
      />

      {/* Upper negative-space title & primary controls */}
      <div className="relative z-10 my-auto max-w-md pointer-events-auto">
        {/* Custom Inline SVG Title Emblem & Lockup */}
        <div className="mb-6">
          <svg
            viewBox="0 0 380 94"
            className="w-72 md:w-96 h-auto drop-shadow-[0_6px_18px_rgba(0,0,0,0.85)]"
            role="img"
            aria-label="CROWNBREAK"
          >
            {/* Geometric Crown + Crosshair Crest */}
            <g transform="translate(4, 14)">
              <circle
                cx="30"
                cy="32"
                r="26"
                fill="#111520"
                stroke="#d4a853"
                strokeWidth="2.2"
              />
              <path
                d="M17 41 20 24 27 31 30 19 33 31 40 24 43 41H17Z"
                fill="#f3efe6"
                stroke="#0b0d12"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M30 2v8M30 54v8M2 32h8M50 32h8"
                stroke="#d4a853"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </g>

            {/* Title Wordmark */}
            <text
              x="78"
              y="52"
              fill="#f3efe6"
              stroke="#0b0d12"
              strokeWidth="4"
              paintOrder="stroke fill"
              fontFamily="Cinzel, Georgia, serif"
              fontSize="36"
              fontWeight="700"
              letterSpacing="2.5"
            >
              CROWNBREAK
            </text>
            <text
              x="80"
              y="74"
              fill="#d4a853"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fontSize="12.5"
              fontWeight="600"
              letterSpacing="3.2"
            >
              TACTICAL FPS CHESS
            </text>
          </svg>
        </div>

        <p className="text-sm md:text-base text-[#d5d0c5] leading-relaxed mb-7 max-w-sm">
          Command every square on the marble board, then settle every capture in a
          1v1 first-person arena duel.
        </p>

        {/* Difficulty Segmented Selector */}
        <div className="mb-6">
          <div className="text-xs font-medium text-[#9ca3af] mb-2">
            Opponent Skill
          </div>
          <div
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#141824]/95 border border-white/12"
            role="group"
            aria-label="Opponent Skill"
          >
            {DIFFICULTIES.map((d) => {
              const active = difficulty === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDifficulty(d.id)}
                  className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#d4a853] ${
                    active
                      ? 'bg-[#d4a853] text-[#0b0d12]'
                      : 'text-[#cbd5e1] hover:text-white'
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary & Secondary CTAs (<= 3 actions total) */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={onStartMatch}
            className="px-6 py-3 rounded-lg bg-[#d4a853] hover:bg-[#e1b967] text-[#0b0d12] font-semibold text-sm tracking-wide transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg focus-visible:outline-2 focus-visible:outline-white"
          >
            Start Match
          </button>
          <button
            type="button"
            onClick={onQuickDuel}
            className="px-5 py-3 rounded-lg bg-[#171c29]/95 hover:bg-[#22293b] text-[#f3efe6] border border-white/15 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#d4a853]"
          >
            Quick Duel
          </button>
        </div>
      </div>

      {/* Flat single-line bottom control hint */}
      <div className="relative z-10 text-xs text-[#9ca3af] hud-stroke whitespace-nowrap overflow-hidden text-ellipsis">
        Click Piece to Move · Capture Triggers 1v1 FPS Duel · WASD + Mouse in
        Combat · Esc Pause
      </div>
    </div>
  );
}
