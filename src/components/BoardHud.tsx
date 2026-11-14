import { RotateCcw, Pause, Volume2, VolumeX, RefreshCw } from 'lucide-react';
import { CLASS_SPECS } from '../game/classes';
import type { BoardHudSnapshot } from '../game/types';
import { PieceSvgIcon } from './PieceSvgIcon';

interface BoardHudProps {
  hud: BoardHudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onFlipCamera: () => void;
}

export function BoardHud({
  hud,
  muted,
  onToggleMute,
  onPause,
  onRestart,
  onFlipCamera,
}: BoardHudProps) {
  const selectedSpec = hud.selectedPiece
    ? CLASS_SPECS[hud.selectedPiece.type]
    : null;

  const myColorLabel = hud.myColor === 'black' ? 'Black' : 'White';
  const turnLabel = hud.isMultiplayer
    ? hud.turn === hud.myColor
      ? `Your Turn · ${myColorLabel}`
      : `Opponent's Turn · ${hud.turn === 'white' ? 'White' : 'Black'}`
    : hud.aiThinking
      ? 'Black Thinking...'
      : hud.turn === 'white'
        ? 'White to Move'
        : 'Black to Move';

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* Top Perimeter Row */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Turn & Match Readout */}
        <div className="bg-[#0e1118]/88 border border-white/12 rounded-lg px-4 py-2.5 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="font-display text-base md:text-lg font-bold tracking-wide text-[#f3efe6] hud-stroke">
              {turnLabel}
            </span>
            {(hud.whiteInCheck || hud.blackInCheck) && (
              <span className="text-xs font-bold uppercase tracking-wider text-[#f87171]">
                {hud.whiteInCheck ? 'White King Exposed' : 'Black King Exposed'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#a1a8b8] mt-0.5 font-mono-num">
            {hud.isMultiplayer && hud.roomCode && (
              <>
                <span className="text-[#d4a853]">Room {hud.roomCode}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    hud.opponentConnected === false ? 'text-[#fbbf24]' : ''
                  }
                >
                  {hud.opponentConnected === false
                    ? `${hud.opponentName ?? 'Opponent'} Reconnecting`
                    : `vs ${hud.opponentName ?? 'Opponent'}`}
                </span>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>White {hud.whitePiecesLeft}</span>
            <span aria-hidden="true">·</span>
            <span>Black {hud.blackPiecesLeft}</span>
            {hud.lastMoveNotation && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#d4a853]">Last {hud.lastMoveNotation}</span>
              </>
            )}
          </div>
        </div>

        {/* Top-Right Compact Utility Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onFlipCamera();
            }}
            aria-label="Flip Board Camera [C]"
            title="Flip Camera [C]"
            className="w-10 h-10 rounded-lg bg-[#0e1118]/88 hover:bg-[#1b202e] border border-white/14 flex items-center justify-center text-[#e5e7eb] cursor-pointer transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            title={muted ? 'Unmute [M]' : 'Mute [M]'}
            className="w-10 h-10 rounded-lg bg-[#0e1118]/88 hover:bg-[#1b202e] border border-white/14 flex items-center justify-center text-[#e5e7eb] cursor-pointer transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {!hud.isMultiplayer && (
            <button
              type="button"
              tabIndex={-1}
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              aria-label="Restart Match [R]"
              title="Restart [R]"
              className="w-10 h-10 rounded-lg bg-[#0e1118]/88 hover:bg-[#1b202e] border border-white/14 flex items-center justify-center text-[#e5e7eb] cursor-pointer transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause Game [P]"
            title="Pause [P]"
            className="w-10 h-10 rounded-lg bg-[#0e1118]/88 hover:bg-[#1b202e] border border-white/14 flex items-center justify-center text-[#e5e7eb] cursor-pointer transition-colors"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Perimeter Selection / Class Spec Dock */}
      <div className="flex justify-center">
        <div className="bg-[#0e1118]/90 border border-white/12 rounded-lg px-4 py-2.5 shadow-lg max-w-xl">
          {hud.selectedPiece && selectedSpec ? (
            <div className="flex items-center gap-3.5">
              <PieceSvgIcon
                type={hud.selectedPiece.type}
                accent={selectedSpec.accentHex}
                className="w-7 h-7 shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#f3efe6]">
                  <span>
                    {selectedSpec.label} · {selectedSpec.weaponName}
                  </span>
                  <span className="text-xs text-[#9ca3af] font-normal">
                    ({selectedSpec.weaponRole})
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#cbd5e1] font-mono-num mt-0.5">
                  <span>{selectedSpec.maxHp} HP</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {selectedSpec.pellets > 1
                      ? `${selectedSpec.damage}x${selectedSpec.pellets} DMG`
                      : `${selectedSpec.damage} DMG`}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#10b981]">
                    {hud.legalMoveCount} Moves
                  </span>
                  {hud.captureMoveCount > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-[#f87171]">
                        {hud.captureMoveCount} Duel Targets
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs md:text-sm text-[#cbd5e1]">
              {hud.isMultiplayer
                ? hud.turn === hud.myColor
                  ? `Select a ${myColorLabel} piece to move, or target an enemy piece on a red square to start an FPS Duel.`
                  : `Waiting for ${hud.opponentName ?? 'opponent'} to move...`
                : 'Select a White piece to move, or target an enemy piece on a red square to start an FPS Duel.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
