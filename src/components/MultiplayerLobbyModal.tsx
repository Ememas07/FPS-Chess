import { useState } from 'react';
import { Check, Copy, Users, X } from 'lucide-react';
import type { RoomSnapshot } from '../game/multiplayerTypes.ts';
import type { ConnectionStatus } from '../net/multiplayerClient.ts';

interface MultiplayerLobbyModalProps {
  connectionStatus: ConnectionStatus;
  room: RoomSnapshot | null;
  playerName: string;
  error: string | null;
  initialCode?: string;
  onPlayerNameChange: (name: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  onQuickMatch: () => void;
  onLeaveRoom: () => void;
  onClose: () => void;
}

export function MultiplayerLobbyModal({
  connectionStatus,
  room,
  playerName,
  error,
  initialCode = '',
  onPlayerNameChange,
  onCreateRoom,
  onJoinRoom,
  onQuickMatch,
  onLeaveRoom,
  onClose,
}: MultiplayerLobbyModalProps) {
  const [joinCode, setJoinCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);

  const handleCopyInvite = () => {
    if (!room) return;
    const url = `${window.location.origin}/?room=${room.code}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-[#090b10]/82 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Online Multiplayer Lobby"
    >
      <div className="w-full max-w-md rounded-xl bg-[#121622] border border-[#d4a853]/35 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#f3efe6] tracking-wide">
              Online Multiplayer
            </h2>
            <div className="text-xs text-[#9ca3af] mt-0.5">
              {connectionStatus === 'connected'
                ? 'Server connected'
                : connectionStatus === 'connecting'
                  ? 'Connecting to match server...'
                  : 'Ready to connect'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Multiplayer Lobby"
            className="w-9 h-9 rounded-lg bg-[#1b202e] hover:bg-[#252d42] border border-white/10 flex items-center justify-center text-[#cbd5e1] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-[#7f1d1d]/50 border border-[#ef4444]/50 px-3.5 py-2.5 text-xs text-[#fecaca]"
          >
            {error}
          </div>
        )}

        {!room ? (
          <div className="space-y-5">
            <div>
              <label
                htmlFor="mp-player-name"
                className="block text-xs font-medium text-[#cbd5e1] mb-1.5"
              >
                Your Name
              </label>
              <input
                id="mp-player-name"
                type="text"
                maxLength={18}
                value={playerName}
                onChange={(e) => onPlayerNameChange(e.target.value)}
                placeholder="Challenger"
                className="w-full rounded-lg bg-[#0b0e16] border border-white/15 px-3.5 py-2.5 text-sm text-[#f3efe6] placeholder:text-[#64748b] focus:outline-none focus:border-[#d4a853]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onQuickMatch}
                className="py-2.5 px-4 rounded-lg bg-[#d4a853] hover:bg-[#e1b967] text-[#0b0d12] font-semibold text-sm cursor-pointer transition-colors"
              >
                Quick Match
              </button>
              <button
                type="button"
                onClick={onCreateRoom}
                className="py-2.5 px-4 rounded-lg bg-[#1c2233] hover:bg-[#252d42] text-[#f3efe6] border border-white/14 font-semibold text-sm cursor-pointer transition-colors"
              >
                Create Room
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (joinCode.trim().length > 0) {
                  onJoinRoom(joinCode.trim().toUpperCase());
                }
              }}
              className="pt-4 border-t border-white/10"
            >
              <label
                htmlFor="mp-room-code"
                className="block text-xs font-medium text-[#cbd5e1] mb-1.5"
              >
                Join by Room Code
              </label>
              <div className="flex gap-2">
                <input
                  id="mp-room-code"
                  type="text"
                  maxLength={8}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. K7M4P)"
                  className="flex-1 rounded-lg bg-[#0b0e16] border border-white/15 px-3.5 py-2.5 text-sm font-mono-num uppercase tracking-wider text-[#f3efe6] placeholder:text-[#64748b] focus:outline-none focus:border-[#d4a853]"
                />
                <button
                  type="submit"
                  disabled={joinCode.trim().length === 0}
                  className="px-4 py-2.5 rounded-lg bg-[#1c2233] hover:bg-[#252d42] disabled:opacity-45 text-[#f3efe6] border border-white/14 font-semibold text-sm cursor-pointer transition-colors"
                >
                  Join
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-lg bg-[#0b0e16] border border-[#d4a853]/30 p-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-[#9ca3af]">
                  Room Code
                </div>
                <div className="font-mono-num text-2xl font-bold tracking-widest text-[#d4a853]">
                  {room.code}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1c2233] hover:bg-[#252d42] border border-white/12 text-xs font-semibold text-[#f3efe6] cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#10b981]" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy Invite
                  </>
                )}
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-[#cbd5e1] mb-2">
                <Users className="w-3.5 h-3.5 text-[#d4a853]" />
                <span>Players ({room.players.length}/2)</span>
              </div>
              <div className="space-y-2">
                {(['white', 'black'] as const).map((color) => {
                  const p = room.players.find((pl) => pl.color === color);
                  return (
                    <div
                      key={color}
                      className="flex items-center justify-between rounded-lg bg-[#171c29] border border-white/10 px-3.5 py-2.5 text-sm"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-3 h-3 rounded-sm border ${
                            color === 'white'
                              ? 'bg-[#ebe4d6] border-white/40'
                              : 'bg-[#1b1f29] border-[#d4a853]/50'
                          }`}
                        />
                        <span className="font-medium text-[#f3efe6]">
                          {p ? p.name : 'Waiting for opponent...'}
                        </span>
                      </div>
                      <span className="text-xs text-[#9ca3af]">
                        {color === 'white' ? 'White' : 'Black'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <div className="text-xs text-[#9ca3af]">
                Match begins automatically when both players join.
              </div>
              <button
                type="button"
                onClick={onLeaveRoom}
                className="px-4 py-2 rounded-lg bg-transparent hover:bg-white/5 text-[#cbd5e1] border border-white/12 text-xs font-semibold cursor-pointer shrink-0"
              >
                Leave Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
