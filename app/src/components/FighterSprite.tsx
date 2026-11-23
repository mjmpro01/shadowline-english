import { useEffect, useState, type CSSProperties } from 'react'
import { artURL, layersFor, loadArt, type Animation, type ArtManifest } from '../lib/arenaArt'
import type { GearSlot } from '../repository'

/** The order gear is drawn in, under the hair: feet first, the charm last. */
const DRAW_ORDER: GearSlot[] = ['feet', 'body', 'hands', 'head', 'weapon', 'charm']

const SKINS = ['#f3d2b3', '#dcae86', '#b07a50', '#7a4e2e']
const HAIRS = ['#2b1d14', '#6b3f1d', '#c99a3b', '#9a9aa3']

export interface SpriteProps {
  body: 'a' | 'b'
  skin: number
  hair: number
  equipped: Partial<Record<GearSlot, string>>
  animation?: Animation
  /** Which way the fighter looks. The art faces right. */
  facing?: 'right' | 'left'
  size?: number
  label?: string
  /** A whole sheet that, once delivered, draws this fighter instead of the
   *  layers: "opponent/{id}" for the tower's own art. */
  sheet?: string
}

/**
 * A fighter: the artist's sheets stacked layer on layer when every one of them
 * is there, otherwise a figure drawn here from the same choices, so the gear
 * a learner buys shows on them either way.
 */
export function FighterSprite(props: SpriteProps) {
  const { size = 220, facing = 'right', label } = props
  const [art, setArt] = useState<ArtManifest | null>(null)
  useEffect(() => {
    let alive = true
    void loadArt().then((m) => alive && setArt(m))
    return () => {
      alive = false
    }
  }, [])

  const gear = DRAW_ORDER.map((slot) => props.equipped[slot]).filter((id): id is string => !!id)
  const layers = layersFor(props.body, props.skin, props.hair, gear)
  const whole = props.sheet && art?.layers[props.sheet]
  const sheets = whole ? [whole] : art ? layers.map((l) => art.layers[l]) : []
  const drawn = art != null && sheets.every(Boolean)

  return (
    <div
      className="fighter"
      data-facing={facing}
      data-animation={props.animation ?? 'idle'}
      data-body={props.body}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      {/* What is worn, for anybody (and any test) asking. */}
      {gear.map((id) => (
        <span key={id} data-item={id} hidden />
      ))}
      {drawn ? (
        <SheetLayers manifest={art} sheets={sheets as string[]} animation={props.animation ?? 'idle'} size={size} />
      ) : (
        <PaperDoll {...props} />
      )}
    </div>
  )
}

function SheetLayers({ manifest, sheets, animation, size }: { manifest: ArtManifest; sheets: string[]; animation: Animation; size: number }) {
  const anim = manifest.animations[animation] ?? manifest.animations.idle ?? { row: 0, frames: 1, fps: 1 }
  const scale = size / manifest.frame
  // One box for every layer, so the moves in arena.css (the lunge, the hit,
  // the fall) carry the whole drawn fighter, as they carry the stand-in.
  return (
    <div className={`fighter-doll fighter-stack${manifest.pixel ? ' fighter-pixel' : ''}`} aria-hidden="true">
      {sheets.map((sheet, i) => (
        <span
          key={i}
          className="fighter-sheet"
          style={
            {
              backgroundImage: `url(${artURL(sheet)})`,
              '--frames': anim.frames,
              '--row': anim.row,
              '--rows': Math.max(...Object.values(manifest.animations).map((a) => (a?.row ?? 0) + 1)),
              '--duration': `${(anim.frames / anim.fps).toFixed(2)}s`,
              '--frame': `${manifest.frame * scale}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/** The stand-in figure: simple shapes in the colours of what is chosen and worn. */
function PaperDoll({ body, skin, hair, equipped }: SpriteProps) {
  // Body a is the male fighter, broader in the shoulder; b the female one.
  const female = body === 'b'
  const skinColour = SKINS[skin] ?? SKINS[0]
  const hairColour = HAIRS[hair] ?? HAIRS[0]
  const torsoW = female ? 32 : 38
  const tx = 60 - torsoW / 2
  const look = GEAR_LOOK
  const bodyGear = look[equipped.body ?? 'rags'] ?? look.rags
  const handsGear = equipped.hands && equipped.hands !== 'bare_fists' ? look[equipped.hands] : undefined
  const feetGear = equipped.feet && equipped.feet !== 'bare_feet' ? look[equipped.feet] : undefined
  const headGear = equipped.head ? look[equipped.head] : undefined
  const weapon = equipped.weapon
  const charm = equipped.charm ? look[equipped.charm] : undefined
  return (
    <svg viewBox="0 0 120 160" className="fighter-doll" aria-hidden="true">
      <ellipse cx="60" cy="154" rx="30" ry="4" fill="rgba(0,0,0,.18)" />
      {/* legs and feet */}
      <rect x={tx + 4} y="104" width="11" height="40" rx="4" fill={skinColour} />
      <rect x={tx + torsoW - 15} y="104" width="11" height="40" rx="4" fill={skinColour} />
      <rect x={female ? tx - 1 : tx + 2} y="98" width={female ? torsoW + 2 : torsoW - 4} height="22" rx="4" fill={bodyGear.dark} />
      {feetGear && (
        <>
          <rect x={tx + 2} y="138" width="16" height="9" rx="3" fill={feetGear.main} />
          <rect x={tx + torsoW - 16} y="138" width="16" height="9" rx="3" fill={feetGear.main} />
        </>
      )}
      {/* back arm */}
      <rect x={tx - 8} y="58" width="10" height="38" rx="5" fill={skinColour} />
      {/* torso: what is worn on the body */}
      <rect x={tx} y="54" width={torsoW} height="50" rx="8" fill={bodyGear.main} />
      {equipped.body === 'rags' || !equipped.body ? (
        <>
          <path d={`M${tx} 96 l6 10 l5 -8 l6 9 l5 -9 l6 10 l5 -8 l${torsoW - 33} 6 V96 Z`} fill={bodyGear.main} />
          <rect x={tx + 6} y="66" width="9" height="7" fill={bodyGear.dark} opacity=".6" />
          <rect x={tx + torsoW - 14} y="82" width="8" height="6" fill={bodyGear.dark} opacity=".6" />
        </>
      ) : (
        <rect x={tx} y="88" width={torsoW} height="5" fill={bodyGear.dark} />
      )}
      {charm && <circle cx="60" cy="62" r="4" fill={charm.main} stroke="#fff" strokeWidth="1" />}
      {/* head and hair */}
      <rect x="54" y="44" width="12" height="12" fill={skinColour} />
      <circle cx="60" cy="34" r="16" fill={skinColour} />
      <circle cx="66" cy="32" r="2" fill="#2b1d14" />
      <HairShape style={hair} colour={hairColour} />
      {headGear && <HeadGear id={equipped.head!} colour={headGear.main} dark={headGear.dark} />}
      {/* front arm, fist and weapon */}
      <rect x={tx + torsoW - 4} y="58" width="10" height="34" rx="5" fill={skinColour} transform={`rotate(-35 ${tx + torsoW} 60)`} />
      {weapon && <Weapon id={weapon} x={tx + torsoW + 18} y={78} />}
      <circle cx={tx + torsoW + 17} cy="80" r="6.5" fill={handsGear?.main ?? skinColour} />
    </svg>
  )
}

function HairShape({ style, colour }: { style: number; colour: string }) {
  switch (style) {
    case 1:
      return <path d="M44 32 a16 16 0 0 1 32 -4 l-6 -2 l-4 6 l-6 -6 l-6 6 l-4 -5 Z" fill={colour} />
    case 2:
      return <path d="M43 36 a17 17 0 0 1 34 -6 l-4 4 Q60 22 47 34 l-2 16 Z" fill={colour} />
    case 3:
      return <circle cx="56" cy="18" r="7" fill={colour} />
    default:
      return <path d="M44 30 a16 16 0 0 1 32 0 Q60 20 44 30 Z" fill={colour} />
  }
}

function HeadGear({ id, colour, dark }: { id: string; colour: string; dark: string }) {
  if (id === 'straw_hat') return <path d="M36 26 h48 l-8 -4 q-16 -14 -32 0 Z" fill={colour} stroke={dark} strokeWidth="1.5" />
  return <path d="M43 30 a17 17 0 0 1 34 0 v4 h-34 Z" fill={colour} stroke={dark} strokeWidth="1.5" />
}

function Weapon({ id, x, y }: { id: string; x: number; y: number }) {
  if (id === 'twin_blades')
    return (
      <g stroke="#cfd6de" strokeWidth="3" strokeLinecap="round">
        <line x1={x} y1={y} x2={x + 22} y2={y - 34} />
        <line x1={x - 4} y1={y + 2} x2={x + 10} y2={y - 38} />
      </g>
    )
  const long = id === 'bo_staff'
  return <line x1={x - 6} y1={y + (long ? 30 : 16)} x2={x + 6} y2={y - (long ? 50 : 30)} stroke="#8a5a2b" strokeWidth="4" strokeLinecap="round" />
}

/** The stand-in colours of each piece of gear. */
const GEAR_LOOK: Record<string, { main: string; dark: string }> = {
  rags: { main: '#9c8462', dark: '#6e5a40' },
  bare_fists: { main: '', dark: '' },
  bare_feet: { main: '', dark: '' },
  patched_tunic: { main: '#7d8b5a', dark: '#566140' },
  leather_vest: { main: '#8b5a33', dark: '#5e3c21' },
  scale_mail: { main: '#8fa3b3', dark: '#5d6f7d' },
  straw_hat: { main: '#e2c56b', dark: '#a8893a' },
  leather_cap: { main: '#8b5a33', dark: '#5e3c21' },
  iron_helm: { main: '#a9b4be', dark: '#6b7782' },
  cloth_wraps: { main: '#efe7d6', dark: '#c4b89f' },
  leather_gloves: { main: '#7a4b2a', dark: '#4e2f1a' },
  iron_knuckles: { main: '#9aa5ae', dark: '#5f6b74' },
  straw_sandals: { main: '#d8b860', dark: '#9c8240' },
  swift_boots: { main: '#3f6fb5', dark: '#284a7c' },
  lucky_coin: { main: '#f2c230', dark: '#a8851d' },
  jade_charm: { main: '#3fae7a', dark: '#26704e' },
  phoenix_feather: { main: '#ef6a3a', dark: '#a8401e' },
}
