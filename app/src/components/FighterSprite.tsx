import { useEffect, useState } from 'react'
import {
  SHEET,
  animationOf,
  artURL,
  characterStack,
  frameAt,
  loadArt,
  type AnimSpec,
  type Animation,
  type ArtManifest,
} from '../lib/arenaArt'
import type { CharacterLook } from '../repository'

/** A sheet's size in frames: as wide as its longest row, as tall as its rows. */
const SHEET_COLUMNS = Math.max(...Object.values(SHEET).map((a) => a.frames))
const SHEET_ROWS = Math.max(...Object.values(SHEET).map((a) => a.row + 1))

export interface SpriteProps {
  /** Who is drawn: one of the Arena's characters. */
  character: CharacterLook
  animation?: Animation
  /** The skill being played, for its glow (with the special animation). */
  skill?: string
  /** Which way the fighter looks. The art faces right. */
  facing?: 'right' | 'left'
  size?: number
  label?: string
}

/**
 * A fighter: the character's own drawing when it has been delivered, its
 * sheet animated frame by frame; otherwise a figure drawn here in the
 * character's colours, holding the kind of weapon they hold.
 */
export function FighterSprite(props: SpriteProps) {
  const { size = 220, facing = 'right', label, character } = props
  const animation = props.animation ?? 'idle'
  const [art, setArt] = useState<ArtManifest | null>(null)
  useEffect(() => {
    let alive = true
    void loadArt().then((m) => alive && setArt(m))
    return () => {
      alive = false
    }
  }, [])

  const stack = art ? characterStack(character.id, art) : null

  return (
    <div
      className="fighter"
      data-facing={facing}
      data-animation={animation}
      data-character={character.id}
      data-skill={animation === 'special' ? props.skill : undefined}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {art && stack ? (
        <ArtLayers
          // A new move starts its frames from the first.
          key={animation}
          manifest={art}
          files={stack.files}
          spec={stack.sheet ? animationOf(art, animation) : null}
          size={size}
        />
      ) : (
        <StandIn character={character} />
      )}
      {animation === 'special' && props.skill && <span className="skill-burst" aria-hidden="true" />}
    </div>
  )
}

/** Whether the viewer has asked for less motion: then a move shows its first frame. */
function prefersStill(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * The frame every layer is on. One clock for the whole fighter, started when
 * the move starts: layers never step on their own, so they cannot drift apart,
 * and a move that plays once stops on its last frame.
 */
function useFrame(spec: AnimSpec | null): number {
  const [frame, setFrame] = useState(0)
  // Primitives, not the object: a new object every render would restart the
  // clock on every frame it sets.
  const frames = spec?.frames ?? 1
  const fps = spec?.fps ?? 1
  const loop = spec?.loop !== false
  useEffect(() => {
    if (frames <= 1 || prefersStill()) return
    const started = performance.now()
    const tick = window.setInterval(() => {
      const next = frameAt(performance.now() - started, { frames, fps, loop })
      setFrame(next)
      if (!loop && next >= frames - 1) window.clearInterval(tick)
    }, 1000 / fps / 2)
    return () => window.clearInterval(tick)
  }, [frames, fps, loop])
  return frame
}

function ArtLayers({
  manifest,
  files,
  spec,
  size,
}: {
  manifest: ArtManifest
  files: string[]
  /** The move's frames, for a fighter drawn from sheets; null for one pose. */
  spec: Required<AnimSpec> | null
  size: number
}) {
  const frame = useFrame(spec)
  const cell = size
  // A sheet is a grid of cells the size of the fighter; one pose is one cell.
  const columns = spec ? SHEET_COLUMNS : 1
  const rows = spec ? SHEET_ROWS : 1
  const x = spec ? -frame * cell : 0
  const y = spec ? -spec.row * cell : 0
  // One box for every layer, so the moves in arena.css (the lunge, the hit,
  // the fall) carry the whole drawn fighter, as they carry the stand-in. A
  // fighter drawn from sheets says so, and keeps only the motions for moves
  // it has no frames of.
  return (
    <div
      className={`fighter-doll fighter-stack${manifest.pixel ? ' fighter-pixel' : ''}`}
      data-sheet={spec ? '' : undefined}
      data-frame={frame}
      aria-hidden="true"
    >
      {files.map((file, i) => (
        <span
          key={i}
          className="fighter-sheet"
          style={{
            backgroundImage: `url(${artURL(file)})`,
            backgroundSize: `${columns * cell}px ${rows * cell}px`,
            backgroundPosition: `${x}px ${y}px`,
          }}
        />
      ))}
    </div>
  )
}

/** The stand-in figure: simple shapes in the character's two colours, with
 *  the shape of their weapon. */
function StandIn({ character }: { character: CharacterLook }) {
  const [main, second] = character.palette
  const female = character.female
  const skin = '#e8c09a'
  const torsoW = female ? 32 : 38
  const tx = 60 - torsoW / 2
  const handX = tx + torsoW + 17
  return (
    <svg viewBox="0 0 120 160" className="fighter-doll" aria-hidden="true">
      <ellipse cx="60" cy="154" rx="30" ry="4" fill="rgba(0,0,0,.18)" />
      {/* legs */}
      <rect x={tx + 4} y="104" width="11" height="40" rx="4" fill={second} />
      <rect x={tx + torsoW - 15} y="104" width="11" height="40" rx="4" fill={second} />
      <rect x={tx + 2} y="140" width="15" height="7" rx="3" fill="#3a2a20" />
      <rect x={tx + torsoW - 16} y="140" width="15" height="7" rx="3" fill="#3a2a20" />
      {/* back arm */}
      <rect x={tx - 8} y="58" width="10" height="38" rx="5" fill={skin} />
      {/* torso */}
      <rect x={tx} y="54" width={torsoW} height="50" rx="8" fill={main} />
      <rect x={tx} y="88" width={torsoW} height="5" fill={second} />
      {/* head and hair */}
      <rect x="54" y="44" width="12" height="12" fill={skin} />
      <circle cx="60" cy="34" r="16" fill={skin} />
      <circle cx="66" cy="32" r="2" fill="#2b1d14" />
      {female ? (
        <path d="M43 36 a17 17 0 0 1 34 -6 l-4 4 Q60 22 47 34 l-2 16 Z" fill="#2b1d14" />
      ) : (
        <path d="M44 30 a16 16 0 0 1 32 0 Q60 20 44 30 Z" fill="#2b1d14" />
      )}
      {/* front arm, weapon and fist */}
      <rect x={tx + torsoW - 4} y="58" width="10" height="34" rx="5" fill={skin} transform={`rotate(-35 ${tx + torsoW} 60)`} />
      <WeaponShape kind={character.weapon.kind} x={handX} y={80} colour={second} />
      <circle cx={handX} cy="80" r="6.5" fill={skin} />
    </svg>
  )
}

function WeaponShape({ kind, x, y, colour }: { kind: string; x: number; y: number; colour: string }) {
  const steel = '#cfd6de'
  const wood = '#8a5a2b'
  switch (kind) {
    case 'staff':
      return <line x1={x - 8} y1={y + 36} x2={x + 8} y2={y - 56} stroke={wood} strokeWidth="4" strokeLinecap="round" />
    case 'spear':
      return (
        <g strokeLinecap="round">
          <line x1={x - 8} y1={y + 36} x2={x + 8} y2={y - 52} stroke={wood} strokeWidth="4" />
          <path d={`M${x + 8} ${y - 66} l5 14 h-10 Z`} fill={steel} />
        </g>
      )
    case 'blade':
      return <line x1={x} y1={y} x2={x + 20} y2={y - 36} stroke={steel} strokeWidth="4" strokeLinecap="round" />
    case 'bow':
      return <path d={`M${x + 4} ${y - 36} q18 36 0 72`} fill="none" stroke={wood} strokeWidth="4" strokeLinecap="round" />
    case 'fan':
      return <path d={`M${x} ${y} l-10 -26 a28 28 0 0 1 26 -4 Z`} fill={colour} stroke="#2b1d14" strokeWidth="1" />
    case 'hammer':
      return (
        <g>
          <line x1={x} y1={y + 6} x2={x + 10} y2={y - 30} stroke={wood} strokeWidth="4" strokeLinecap="round" />
          <rect x={x + 2} y={y - 42} width="20" height="12" rx="2" fill="#6b7782" transform={`rotate(15 ${x + 12} ${y - 36})`} />
        </g>
      )
    case 'whip':
      return <path d={`M${x} ${y} q20 -10 14 -30 q-6 -18 14 -26`} fill="none" stroke={steel} strokeWidth="3" strokeLinecap="round" />
    case 'sling':
      return <path d={`M${x} ${y} v-14 m0 0 l-6 -12 m6 12 l6 -12`} fill="none" stroke={wood} strokeWidth="3" strokeLinecap="round" />
    case 'gourd':
      return (
        <g>
          <circle cx={x + 6} cy={y - 4} r="7" fill="#c9a25a" />
          <circle cx={x + 6} cy={y - 14} r="4.5" fill="#c9a25a" />
        </g>
      )
    default:
      return null
  }
}
