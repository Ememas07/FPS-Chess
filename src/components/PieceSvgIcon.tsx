import type { PieceType } from '../game/types';

interface PieceIconProps {
  type: PieceType;
  className?: string;
  accent?: string;
}

export function PieceSvgIcon({
  type,
  className = 'w-6 h-6',
  accent = '#d4a853',
}: PieceIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {type === 'pawn' && (
        <>
          <circle
            cx="12"
            cy="7"
            r="3.2"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.5"
          />
          <path
            d="M9 11.2h6l-1.2 5.3h2.2v2.5H8v-2.5h2.2L9 11.2Z"
            fill="#f3efe6"
            stroke="#0b0d12"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect
            x="6.5"
            y="19.5"
            width="11"
            height="2.2"
            rx="0.6"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.2"
          />
        </>
      )}
      {type === 'rook' && (
        <>
          <path
            d="M6.5 4.5h2.2v2h2.2v-2h2.2v2h2.2v-2h2.2v4.8l-1.5 1.5v6.2l1.6 2H6.4l1.6-2v-6.2L6.5 9.3V4.5Z"
            fill="#f3efe6"
            stroke="#0b0d12"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect
            x="6"
            y="19.2"
            width="12"
            height="2.3"
            rx="0.6"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.2"
          />
        </>
      )}
      {type === 'knight' && (
        <>
          <path
            d="M15.5 4.5 11 6.2 7.5 10.2l2.2 1.8 2.1-1.3-.9 3.6-3.3 4.7h9.8V13c0-3.2-1.1-5.8-1.9-8.5Z"
            fill="#f3efe6"
            stroke="#0b0d12"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="11.4" cy="8.2" r="0.9" fill={accent} />
          <rect
            x="6.5"
            y="19.2"
            width="11"
            height="2.3"
            rx="0.6"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.2"
          />
        </>
      )}
      {type === 'bishop' && (
        <>
          <circle
            cx="12"
            cy="4.3"
            r="1.6"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.2"
          />
          <path
            d="M12 6.2c-2.6 2.1-3.5 4.9-2.2 7.5l-1.3 5.3h7l-1.3-5.3c1.3-2.6.4-5.4-2.2-7.5Z"
            fill="#f3efe6"
            stroke="#0b0d12"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 10.2 13.5 13"
            stroke="#0b0d12"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <rect
            x="6.5"
            y="19.2"
            width="11"
            height="2.3"
            rx="0.6"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.2"
          />
        </>
      )}
      {type === 'queen' && (
        <>
          <path
            d="M5 7.5 8.5 13 12 6l3.5 7L19 7.5 17 18.8H7L5 7.5Z"
            fill="#f3efe6"
            stroke="#0b0d12"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="5" cy="6.2" r="1.3" fill={accent} />
          <circle cx="12" cy="4.8" r="1.4" fill={accent} />
          <circle cx="19" cy="6.2" r="1.3" fill={accent} />
          <rect
            x="6.2"
            y="19.2"
            width="11.6"
            height="2.3"
            rx="0.6"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.2"
          />
        </>
      )}
      {type === 'king' && (
        <>
          <path
            d="M12 3.2v4.2M9.8 5.2h4.4"
            stroke={accent}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M6.8 10.2c0-2 2.4-2.5 5.2-1.2 2.8-1.3 5.2-.8 5.2 1.2l-1.5 8.6H8.3l-1.5-8.6Z"
            fill="#f3efe6"
            stroke="#0b0d12"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <rect
            x="6.2"
            y="19.2"
            width="11.6"
            height="2.3"
            rx="0.6"
            fill={accent}
            stroke="#0b0d12"
            strokeWidth="1.2"
          />
        </>
      )}
    </svg>
  );
}
