/**
 * Tí, the forest owl: the tutor's face, and the one who cheers.
 *
 * Drawn here as SVG rather than shipped as a picture — a few hundred bytes,
 * sharp at every size from a 28px chat avatar to the first-steps card, and able
 * to change its expression, which a PNG cannot. Colours are its own, not the
 * theme's: a character looks the same on parchment and on the dark board.
 */
export type Mood = 'idle' | 'happy' | 'cheer' | 'think'

export function Mascot({ mood = 'idle', size = 48, title }: { mood?: Mood; size?: number; title?: string }) {
  const closed = mood === 'happy' || mood === 'cheer'
  const look = mood === 'think' ? { x: -3, y: -3 } : { x: 0, y: 0 }
  return (
    <svg
      className={`mascot mascot-${mood}`}
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {/* Wings behind the body; raised when it cheers. */}
      <g className="mascot-wings" fill="#8a5228">
        {mood === 'cheer' ? (
          <>
            <path d="M24 70 C8 58 6 38 14 26 C22 40 30 50 36 58 Z" />
            <path d="M96 70 C112 58 114 38 106 26 C98 40 90 50 84 58 Z" />
          </>
        ) : (
          <>
            <ellipse cx="24" cy="76" rx="11" ry="22" transform="rotate(12 24 76)" />
            <ellipse cx="96" cy="76" rx="11" ry="22" transform="rotate(-12 96 76)" />
          </>
        )}
      </g>
      {/* Ear tufts, then the body. */}
      <path d="M28 34 L34 12 L48 28 Z" fill="#8a5228" />
      <path d="M92 34 L86 12 L72 28 Z" fill="#8a5228" />
      <ellipse cx="60" cy="68" rx="38" ry="42" fill="#b8763d" />
      <ellipse cx="60" cy="84" rx="24" ry="24" fill="#f6ddaa" />
      <path
        d="M50 78 q5 5 10 0 q5 5 10 0 M46 90 q5 5 10 0 q5 5 10 0 q5 5 10 0"
        fill="none"
        stroke="#d9a86a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* A leaf on its head: it lives in the forest the menu is drawn from. */}
      <path d="M60 26 C52 14 58 4 70 4 C70 16 66 24 60 26 Z" fill="#5fae5b" />
      <path d="M60 26 C62 18 65 12 69 6" fill="none" stroke="#3f8a44" strokeWidth="2" strokeLinecap="round" />
      {/* The face disc and the eyes. */}
      <circle cx="43" cy="54" r="17" fill="#fff4d6" />
      <circle cx="77" cy="54" r="17" fill="#fff4d6" />
      {closed ? (
        <g fill="none" stroke="#2b2119" strokeWidth="4" strokeLinecap="round">
          <path d="M35 56 q8 -9 16 0" />
          <path d="M69 56 q8 -9 16 0" />
        </g>
      ) : (
        <g>
          <circle cx={43 + look.x} cy={55 + look.y} r="8.5" fill="#2b2119" />
          <circle cx={77 + look.x} cy={55 + look.y} r="8.5" fill="#2b2119" />
          <circle cx={46 + look.x} cy={52 + look.y} r="3" fill="#fff" />
          <circle cx={80 + look.x} cy={52 + look.y} r="3" fill="#fff" />
        </g>
      )}
      <path d="M54 64 L66 64 L60 74 Z" fill="#e8a33a" />
      <circle cx="32" cy="68" r="5" fill="#f08c8c" opacity="0.55" />
      <circle cx="88" cy="68" r="5" fill="#f08c8c" opacity="0.55" />
      <g fill="#e8a33a">
        <ellipse cx="50" cy="109" rx="7" ry="4" />
        <ellipse cx="70" cy="109" rx="7" ry="4" />
      </g>
    </svg>
  )
}
