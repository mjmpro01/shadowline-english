import { useId } from 'react'

/**
 * The Shadowing Hero: the knight from the app's crest, as the tutor's face and
 * the one who cheers.
 *
 * Cut out of the crest (art/crest.png; the login screens show a small WebP of
 * it), so it is the same character as the login
 * screen and the home-screen icon rather than a second mascot beside them.
 *
 * Two forms. The helmet alone for a chat line or a button, where the whole
 * figure would be a smudge; it only hops or sways. And the whole knight, for
 * anywhere with room, which is a puppet rather than a picture: the plume is its
 * own layer so it can swing, and the eyes are drawn over so they can blink,
 * smile or droop. Every pose is that one drawing moved — nothing here is a
 * second drawing of the knight — which is why there is no waving hand: the
 * arms are painted into the body and cannot bend.
 */
export type Mood = 'idle' | 'happy' | 'cheer' | 'sad' | 'think' | 'sit' | 'jump' | 'walk'

/** The body layers are drawn on a 612 x 895 canvas; the eyes and props below
 *  are placed in the same numbers. */
const W = 612
const H = 895

export function Mascot({
  mood = 'idle',
  size = 48,
  title,
  whole = false,
}: {
  mood?: Mood
  /** The helmet's width and height, or the whole knight's height. */
  size?: number
  title?: string
  /** The whole knight, cape and all, posed. Only where it has real room: in a
   *  circle or a chat line the helmet alone is the face people recognise. */
  whole?: boolean
}) {
  if (whole) return <Knight mood={mood} height={size} title={title} />
  return (
    <img
      className={`mascot mascot-${mood}`}
      src="/mascot/hero-head.webp"
      width={size}
      height={size}
      alt={title ?? ''}
      aria-hidden={title ? undefined : true}
      draggable={false}
      decoding="async"
    />
  )
}

function Knight({ mood, height, title }: { mood: Mood; height: number; title?: string }) {
  // Ids inside an inline SVG are global to the page, and a screen can hold two
  // knights (the loading one and a celebration).
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const skin = `${id}-skin`
  const eyeL = `${id}-eyeL`
  const eyeR = `${id}-eyeR`
  return (
    <span
      className={`knight knight-${mood}`}
      style={{ height }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <svg className="knight-back" viewBox={`0 0 ${W} ${H}`}>
        <ellipse className="knight-shadow" cx="306" cy="862" rx="190" ry="20" />
        {mood === 'sit' && (
          <g className="knight-log">
            <rect x="-70" y="646" width="752" height="150" rx="75" fill="#fffdf7" />
            <rect x="-52" y="664" width="716" height="114" rx="57" fill="#9a6232" stroke="#4a2a16" strokeWidth="8" />
            <path d="M-10 700 H200 M40 742 H170 M420 706 H560 M450 748 H600" stroke="#6e4020" strokeWidth="7" strokeLinecap="round" />
            <ellipse cx="607" cy="721" rx="30" ry="57" fill="#e0ad72" stroke="#4a2a16" strokeWidth="8" />
            <ellipse cx="607" cy="721" rx="15" ry="30" fill="none" stroke="#b77b43" strokeWidth="5" />
          </g>
        )}
      </svg>
      <span className="knight-rig">
        <img className="knight-plume" src="/mascot/knight-plume.webp" alt="" draggable={false} decoding="async" />
        <img src="/mascot/knight-body.webp" alt="" draggable={false} decoding="async" />
        <svg viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <clipPath id={eyeL}>
              <ellipse cx="165" cy="410" rx="28" ry="32" />
            </clipPath>
            <clipPath id={eyeR}>
              <ellipse cx="294" cy="411" rx="32" ry="32" />
            </clipPath>
            <linearGradient id={skin} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#eeb89c" />
              <stop offset="1" stopColor="#fbd4ac" />
            </linearGradient>
          </defs>
          {mood === 'happy' || mood === 'cheer' || mood === 'jump' ? (
            // Eyes shut in a smile, ^^, and a little colour in the cheeks.
            <g>
              <ellipse cx="165" cy="410" rx="31" ry="35" fill={`url(#${skin})`} />
              <ellipse cx="294" cy="411" rx="35" ry="35" fill={`url(#${skin})`} />
              <path
                d="M140 422 Q165 386 190 422 M268 422 Q294 386 320 422"
                fill="none"
                stroke="#3a1a12"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <ellipse cx="128" cy="438" rx="16" ry="8" fill="#f28b82" opacity=".55" />
              <ellipse cx="334" cy="438" rx="16" ry="8" fill="#f28b82" opacity=".55" />
            </g>
          ) : (
            // Eyelids: closed for a blink, half down when sad.
            <>
              <g clipPath={`url(#${eyeL})`}>
                <g className="knight-lid">
                  <rect x="130" y="376" width="72" height="68" fill={`url(#${skin})`} />
                  <path d="M136 436 Q165 450 196 436" fill="none" stroke="#4a2319" strokeWidth="5" strokeLinecap="round" />
                </g>
              </g>
              <g clipPath={`url(#${eyeR})`}>
                <g className="knight-lid">
                  <rect x="258" y="377" width="74" height="68" fill={`url(#${skin})`} />
                  <path d="M264 437 Q295 451 326 437" fill="none" stroke="#4a2319" strokeWidth="5" strokeLinecap="round" />
                </g>
              </g>
            </>
          )}
          {mood === 'sad' && (
            <path className="knight-tear" d="M146 440 q-12 18 0 26 q12 -8 0 -26z" fill="#7cc4f2" stroke="#2f6f9a" strokeWidth="3" />
          )}
        </svg>
      </span>
      {(mood === 'think' || mood === 'sit') && (
        <svg className="knight-front" viewBox={`0 0 ${W} ${H}`}>
          <g className="knight-cloud" fill="#fff" stroke="#6b5c4c">
            <circle cx="470" cy="280" r="14" strokeWidth="5" />
            <circle cx="510" cy="215" r="22" strokeWidth="5" />
            <g className="knight-puff">
              <path
                d="M470 150 a50 50 0 0 1 60 -60 a55 55 0 0 1 95 -5 a50 50 0 0 1 60 65 a45 45 0 0 1 -35 75 h-140 a45 45 0 0 1 -40 -75z"
                strokeWidth="6"
              />
              <g fill="#6b5c4c" stroke="none">
                <circle className="knight-dot" cx="525" cy="162" r="13" />
                <circle className="knight-dot" cx="575" cy="162" r="13" />
                <circle className="knight-dot" cx="625" cy="162" r="13" />
              </g>
            </g>
          </g>
        </svg>
      )}
    </span>
  )
}
