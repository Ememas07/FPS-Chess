import { useEffect, useRef, useState } from 'react';
import { Pause, Volume2, VolumeX } from 'lucide-react';
import { CLASS_SPECS } from '../game/classes';
import type { DuelHudSnapshot } from '../game/types';
import { PieceSvgIcon } from './PieceSvgIcon';

interface DuelHudProps {
  hud: DuelHudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
}

export function DuelHud({ hud, muted, onToggleMute, onPause }: DuelHudProps) {
  const playerSpec = CLASS_SPECS[hud.playerType];
  const enemySpec = CLASS_SPECS[hud.enemyType];

  // Delayed trailing damage ghost bars
  const [playerGhostPct, setPlayerGhostPct] = useState(100);
  const [enemyGhostPct, setEnemyGhostPct] = useState(100);
  const playerTimerRef = useRef<number | null>(null);
  const enemyTimerRef = useRef<number | null>(null);

  const playerPct = Math.max(
    0,
    Math.min(100, (hud.playerHp / Math.max(1, hud.playerMaxHp)) * 100),
  );
  const enemyPct = Math.max(
    0,
    Math.min(100, (hud.enemyHp / Math.max(1, hud.enemyMaxHp)) * 100),
  );

  useEffect(() => {
    if (playerTimerRef.current) window.clearTimeout(playerTimerRef.current);
    playerTimerRef.current = window.setTimeout(() => {
      setPlayerGhostPct(playerPct);
    }, 240);
    return () => {
      if (playerTimerRef.current) window.clearTimeout(playerTimerRef.current);
    };
  }, [playerPct]);

  useEffect(() => {
    if (enemyTimerRef.current) window.clearTimeout(enemyTimerRef.current);
    enemyTimerRef.current = window.setTimeout(() => {
      setEnemyGhostPct(enemyPct);
    }, 240);
    return () => {
      if (enemyTimerRef.current) window.clearTimeout(enemyTimerRef.current);
    };
  }, [enemyPct]);

  const lowHp = playerPct > 0 && playerPct <= 30;
  const hitActive = hud.hitMarkerTimer > 0;
  const abilityReady = hud.abilityCooldownRemaining <= 0.05;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6">
      {/* Low HP peripheral scrim */}
      {lowHp && (
        <div
          aria-hidden="true"
          className="fixed inset-0 pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 90px rgba(220, 38, 38, 0.45)',
          }}
        />
      )}

      {/* Exact (0,0) Center Crosshair & Hitmarker */}
      <div
        style={{
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      >
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
          {/* Outer reticle ticks */}
          <line
            x1="22"
            y1="8"
            x2="22"
            y2="15"
            stroke="#f3efe6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="22"
            y1="29"
            x2="22"
            y2="36"
            stroke="#f3efe6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="8"
            y1="22"
            x2="15"
            y2="22"
            stroke="#f3efe6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <line
            x1="29"
            y1="22"
            x2="36"
            y2="22"
            stroke="#f3efe6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx="22"
            cy="22"
            r="2.2"
            fill={hud.enemyTelegraphing ? '#ef4444' : playerSpec.accentHex}
          />

          {/* Hitmarker X on confirmed hit */}
          {hitActive && (
            <g
              stroke={hud.lastHitCrit ? '#fbbf24' : '#ffffff'}
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <line x1="12" y1="12" x2="17" y2="17" />
              <line x1="32" y1="12" x2="27" y2="17" />
              <line x1="12" y1="32" x2="17" y2="27" />
              <line x1="32" y1="32" x2="27" y2="27" />
            </g>
          )}
        </svg>
        {hud.isReloading && (
          <div className="text-[11px] font-mono-num text-center text-[#d4a853] hud-stroke -mt-1">
            RELOADING
          </div>
        )}
      </div>

      {/* Top Row: Enemy Boss/Duelist HP Bar + Utility Buttons */}
      <div className="flex items-start justify-between gap-4">
        <div className="w-10" />

        {/* Top-Center Enemy Vitality Bar */}
        <div className="w-full max-w-md bg-[#0e1118]/90 border border-white/14 rounded-lg px-4 py-2.5 shadow-lg">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <PieceSvgIcon
                type={hud.enemyType}
                accent={enemySpec.accentHex}
                className="w-5 h-5 shrink-0"
              />
              <span className="text-xs md:text-sm font-semibold text-[#f3efe6] truncate">
                {hud.enemyColor === 'black' ? 'Black' : 'White'} {enemySpec.label}{' '}
                · {enemySpec.weaponName}
              </span>
            </div>
            <span className="font-mono-num text-xs md:text-sm font-bold text-[#f3efe6] shrink-0">
              {hud.enemyHp} / {hud.enemyMaxHp}
            </span>
          </div>
          <div className="relative h-2.5 w-full rounded bg-[#1b202e] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#fca5a5] transition-all duration-300"
              style={{ width: `${enemyGhostPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-[#ef4444]"
              style={{ width: `${enemyPct}%` }}
            />
          </div>
        </div>

        {/* Top-Right Utilities */}
        <div className="flex items-center gap-2 pointer-events-auto shrink-0">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
            className="w-10 h-10 rounded-lg bg-[#0e1118]/88 hover:bg-[#1b202e] border border-white/14 flex items-center justify-center text-[#e5e7eb] cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Pause Game [P]"
            className="w-10 h-10 rounded-lg bg-[#0e1118]/88 hover:bg-[#1b202e] border border-white/14 flex items-center justify-center text-[#e5e7eb] cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Duel Banner Announcement (upper third, never blocking crosshair) */}
      {hud.duelBanner && (
        <div className="mx-auto mt-3 text-center">
          <div className="font-display text-xl md:text-2xl font-bold tracking-widest text-[#f3efe6] hud-stroke">
            {hud.duelBanner}
          </div>
        </div>
      )}

      {/* Bottom Corners: Player HP (Left) & Weapon/Ability (Right) */}
      <div className="flex items-end justify-between gap-4 mt-auto">
        {/* Bottom-Left Player Vitality */}
        <div className="w-64 md:w-72 bg-[#0e1118]/90 border border-white/14 rounded-lg px-4 py-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <PieceSvgIcon
                type={hud.playerType}
                accent={playerSpec.accentHex}
                className="w-6 h-6 shrink-0"
              />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">
                  HP
                </div>
                <div className="text-sm font-semibold text-[#f3efe6]">
                  {playerSpec.label}
                </div>
              </div>
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#f3efe6] hud-stroke">
              {hud.playerHp}
            </div>
          </div>
          <div className="relative h-2.5 w-full rounded bg-[#1b202e] overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-[#fde68a] transition-all duration-300"
              style={{ width: `${playerGhostPct}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 bg-[#10b981]"
              style={{ width: `${playerPct}%` }}
            />
          </div>
        </div>

        {/* Bottom-Center Subtle Aim Hint when unlocked */}
        {!hud.pointerLocked && (
          <div className="hidden lg:block text-xs text-[#e5e7eb] bg-[#0e1118]/85 border border-white/12 rounded-md px-3 py-1.5 whitespace-nowrap">
            Click Arena to Lock Aim · WASD Move · Space Jump · Click/F Fire · E/RMB{' '}
            {playerSpec.abilityName} · R Reload
          </div>
        )}

        {/* Bottom-Right Weapon Ammo & Ability Slot */}
        <div className="w-64 md:w-72 bg-[#0e1118]/90 border border-white/14 rounded-lg px-4 py-3 shadow-lg">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">
                AMMO
              </div>
              <div className="text-sm font-semibold text-[#f3efe6]">
                {playerSpec.weaponName}
              </div>
            </div>
            <div className="font-mono-num text-2xl font-bold text-[#f3efe6] hud-stroke">
              {hud.ammo}
              <span className="text-sm text-[#9ca3af] font-normal">
                /{hud.magSize}
              </span>
            </div>
          </div>

          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
            <span className="text-[#cbd5e1] font-medium">
              [E] {playerSpec.abilityName}
            </span>
            <span
              className={`font-mono-num font-semibold ${
                hud.abilityActive
                  ? 'text-[#38bdf8]'
                  : abilityReady
                    ? 'text-[#d4a853]'
                    : 'text-[#9ca3af]'
              }`}
            >
              {hud.abilityActive
                ? 'Active'
                : abilityReady
                  ? 'Ready'
                  : `${hud.abilityCooldownRemaining.toFixed(1)}s`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
