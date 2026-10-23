import Phaser from 'phaser'
import type { GameState } from '../api'
import {
  ASSETS,
  type ArtManifest,
  type CharacterSheet,
  art,
  CHAR_COLS,
  CHAR_ROWS,
  DIRS,
  DUST_FRAMES,
  MONSTER_DOWN_ROW,
  MONSTER_FRAMES,
  MONSTER_HURT_ROW,
  MONSTER_MOVE_ROW,
  MONSTER_ROWS,
  MONSTER_SHEETS,
  ALL_NPC_IDS,
  POP_FRAMES,
  ZZZ_FRAMES,
  type Dir,
} from '../assets'
import { paintPlaceholders } from '../art/placeholder'
import { sameTarget, type GameBus, type MapName, type Target } from '../bus'
import { HEIGHT, TILE, WIDTH, inRect, type Cell, type Rect, type TileNames } from '../world/farm'

export interface MapSceneData {
  bus: GameBus
  present: Set<string>
  /** Where the player stands on arrival, or null for the map's own spot. */
  start: { x: number; y: number } | null
  /** The tileset's names, from its atlas when there is one. */
  tiles: TileNames
  /** The tileset's cell size: 16, or 64 for pictures drawn at 4×. */
  tileSize: number
  /** Space around and between the tileset's cells. */
  tileGap: { margin: number; spacing: number }
  /** Set when the pictures are drawn finer than the map (art.json). */
  art: ArtManifest | null
  /** Per character texture (player, npc-mira…): set when it is drawn larger
   *  than the grid and scaled down. */
  sheets: Record<string, CharacterSheet | null>
  /** Screen pixels per CSS pixel the canvas is drawn at. */
  density: number
}

const SPEED = 80
/** How tall a person drawn large stands on the map, in map pixels: a little
 *  under two tiles. */
const PERSON_HEIGHT = 28
/** How far in front of the player's feet an action reaches. */
export const REACH = 12
/** Frames a second for each kind of animation in a drawn sheet. */
const FRAME_RATE: Record<string, number> = { idle: 2, walk: 9, hoe: 6, harvest: 8, sleep: 1.5 }

/**
 * A map the player walks: the farm or the woods.
 *
 * What every map shares lives here — the player, the camera, the keys and the
 * joystick, the "!" over what they face, walking through a gate to another
 * map. Each map draws its own ground and things, and says what can be acted
 * on. It draws and moves; it does not decide anything.
 */
export abstract class MapScene extends Phaser.Scene {
  abstract readonly mapName: MapName

  protected bus!: GameBus
  protected present!: Set<string>
  protected names: TileNames = {}
  private setup!: MapSceneData
  private tileSize = TILE
  private tileGap = { margin: 0, spacing: 0 }
  private artInfo: ArtManifest | null = null
  protected sheets: Record<string, CharacterSheet | null> = {}
  private density = 1

  protected player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  protected facing: Dir = 'down'
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>
  protected walls!: Phaser.Physics.Arcade.StaticGroup
  private focusMarker!: Phaser.GameObjects.Sprite
  protected questMarker!: Phaser.GameObjects.Sprite
  private focused: Target | null = null
  protected state: GameState | null = null
  /** Server clock minus this browser's, so time is the server's. */
  protected clockSkew = 0
  private lastSaved = { x: 0, y: 0 }
  /** Until when the player is busy (the hoe, a harvest, a nap) and stays put. */
  protected busyUntil = 0
  private lastDust = 0
  /** Set while walking through a gate, so it is walked through once. */
  private leaving = false
  private blockedAt = 0
  protected unsubscribe: (() => void)[] = []

  init(data: MapSceneData) {
    this.setup = data
    this.bus = data.bus
    this.present = data.present
    this.names = data.tiles
    this.tileSize = data.tileSize
    this.tileGap = data.tileGap
    this.artInfo = data.art
    this.sheets = { ...data.sheets }
    this.density = data.density
    this.leaving = false
    this.focused = null
  }

  preload() {
    for (const asset of ASSETS) {
      if (!this.present.has(asset.key) || this.textures.exists(asset.key)) continue
      const sheet = this.sheets[asset.key]
      const fine = this.artInfo?.frames[asset.key]
      if (sheet) {
        this.load.spritesheet(asset.key, art(asset.file), {
          frameWidth: sheet.frameWidth,
          frameHeight: sheet.frameHeight,
        })
      } else if (asset.key === 'tiles') {
        this.load.spritesheet('tiles', art(asset.file), {
          frameWidth: this.tileSize,
          frameHeight: this.tileSize,
          ...this.tileGap,
        })
      } else if (fine) {
        this.load.spritesheet(asset.key, art(asset.file), { frameWidth: fine.w, frameHeight: fine.h })
      } else if (asset.frame) {
        this.load.spritesheet(asset.key, art(asset.file), {
          frameWidth: asset.frame.w,
          frameHeight: asset.frame.h,
        })
      } else {
        this.load.image(asset.key, art(asset.file))
      }
    }
  }

  // --- What each map does ------------------------------------------------------

  /** Draws the map: ground, things, people; adds what blocks the way to walls. */
  protected abstract buildWorld(): void
  /** Where a player arrives with no spot of their own. */
  protected abstract arrival(): { x: number; y: number }
  /** Gates out of this map: walking into one goes to that map. */
  protected abstract gates(): { rect: Rect; to: MapName; at: { x: number; y: number } }[]
  /** What the player is facing, if it is something to act on, given the spot
   *  just in front of them. */
  protected abstract targetAt(rx: number, ry: number): Target | null
  /** Where the "!" sits over a target. */
  protected abstract markerFor(target: Target): { x: number; y: number }
  /** The farm as the server last sent it changed. */
  protected applyState(state: GameState) {
    this.state = state
    this.clockSkew = Date.parse(state.now) - Date.now()
  }
  /** Every frame, after the player moved. */
  protected tick(): void {}

  // --- Sizes ----------------------------------------------------------------------

  /** How much a picture is shrunk to sit on the map: 1 for one drawn at the
   *  map's size (and for every stand-in painted in code). */
  protected shrink(key: string): number {
    const sheet = this.sheets[key]
    if (sheet) return PERSON_HEIGHT / sheet.bodyHeight
    if (key === 'tiles') return TILE / this.tileSize
    return this.artInfo && this.present.has(key) ? 1 / this.artInfo.scale : 1
  }

  /** Frames in a strip: the art's count when it is drawn fine, else ours. */
  protected count(key: string, fallback: number): number {
    return (this.present.has(key) && this.artInfo?.frames[key]?.count) || fallback
  }

  /** 0, 1, … for each frame in a strip. */
  protected strip(key: string, fallback: number): number[] {
    return Array.from({ length: this.count(key, fallback) }, (_, i) => i)
  }

  /** Puts a picture on the map at the map's size. */
  protected sized<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(obj: T): T {
    const k = this.shrink(obj.texture.key)
    if (k !== 1) obj.setScale(k)
    return obj
  }

  /** The ground, as a tilemap layer from the map's cells. */
  protected drawGround(cells: Cell[][]): Phaser.Tilemaps.TilemapLayer | null {
    const ts = this.tileSize
    const map = this.make.tilemap({
      data: cells.map((row) => row.map((c) => c.index)),
      tileWidth: ts,
      tileHeight: ts,
    })
    const tiles = map.addTilesetImage('tiles', 'tiles', ts, ts, this.tileGap.margin, this.tileGap.spacing)
    const layer = tiles ? map.createLayer(0, tiles, 0, 0) : null
    if (!layer) return null
    layer.setScale(TILE / ts)
    cells.forEach((row, y) =>
      row.forEach((c, x) => {
        if (!c.flipX && !c.flipY) return
        const t = layer.getTileAt(x, y)
        if (t) {
          t.flipX = !!c.flipX
          t.flipY = !!c.flipY
        }
      }),
    )
    return layer
  }

  /** Something standing on the map, drawn in order of how far down the screen
   *  its feet are, so the player walks behind a tree and in front of it. */
  protected stand(key: string, x: number, y: number, frame?: number) {
    const img = this.sized(this.add.image(x, y, key, frame).setOrigin(0.5, 1))
    img.setDepth(y)
    return img
  }

  protected wall(r: Rect) {
    this.walls.add(this.add.zone((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE, r.w * TILE, r.h * TILE))
  }

  // --- Building the scene ---------------------------------------------------------

  create() {
    this.checkSheets()
    paintPlaceholders(this, this.present)
    // Pictures drawn finer than the map are smoothed as they shrink; the
    // map-sized ones and the painted stand-ins stay crisp.
    for (const asset of ASSETS) {
      if (this.present.has(asset.key) && this.shrink(asset.key) !== 1) {
        this.textures.get(asset.key).setFilter(Phaser.Textures.FilterMode.LINEAR)
      }
    }
    this.makeAnimations()

    this.walls = this.physics.add.staticGroup()
    this.buildWorld()

    const from = this.setup.start ?? this.arrival()
    this.player = this.physics.add.sprite(from.x, from.y, 'player', 0)
    const sheet = this.sheets.player
    if (sheet) {
      // Drawn large: scaled down to the map. The feet stand on the spot, and
      // the body that bumps into things is the same 10×6 at the feet whatever
      // the drawing's size.
      const scale = this.shrink('player')
      this.player.setScale(scale).setOrigin(0.5, sheet.feet / sheet.frameHeight)
      this.player.body
        .setSize(10 / scale, 6 / scale)
        .setOffset((sheet.frameWidth - 10 / scale) / 2, sheet.feet - 6 / scale)
    } else {
      this.player.setOrigin(0.5, 1)
      this.player.body.setSize(10, 6).setOffset(3, 25)
    }
    this.player.setCollideWorldBounds(true)
    this.physics.world.setBounds(0, 0, WIDTH * TILE, HEIGHT * TILE)
    this.physics.add.collider(this.player, this.walls)
    this.lastSaved = { x: from.x, y: from.y }

    this.focusMarker = this.sized(this.add.sprite(0, 0, 'interact', 0)).setVisible(false).setDepth(10_000)
    this.focusMarker.play('interact-bob')
    this.questMarker = this.sized(this.add.sprite(0, 0, 'interact', 0))
      .setVisible(false)
      .setDepth(10_001)
      .setTint(0xffd54f)
    this.questMarker.play('interact-bob')

    // The camera follows, at a whole number of screen pixels per map pixel so
    // the map-sized pictures stay square.
    const camera = this.cameras.main
    camera.setBounds(0, 0, WIDTH * TILE, HEIGHT * TILE)
    camera.startFollow(this.player, true, 0.15, 0.15)
    camera.setRoundPixels(true)
    this.fitZoom()
    this.scale.on('resize', this.fitZoom, this)

    const kb = this.input.keyboard
    if (kb) {
      const K = Phaser.Input.Keyboard.KeyCodes
      // Keys are captured only while the game has focus: elsewhere on the page
      // the arrows still scroll and space still presses buttons.
      kb.disableGlobalCapture()
      this.keys = {
        up: kb.addKey(K.UP, false),
        down: kb.addKey(K.DOWN, false),
        left: kb.addKey(K.LEFT, false),
        right: kb.addKey(K.RIGHT, false),
        w: kb.addKey(K.W, false),
        a: kb.addKey(K.A, false),
        s: kb.addKey(K.S, false),
        d: kb.addKey(K.D, false),
      }
      // Acting listens for the key going down rather than asking each frame
      // whether it just did: a tap shorter than a frame — easy on a slow phone
      // — is down and up again before the frame looks, and was lost.
      for (const name of ['E', 'SPACE', 'ENTER']) {
        kb.on(`keydown-${name}`, () => {
          if (!typingOrOnControl()) this.bus.press()
        })
      }
    }

    this.unsubscribe.push(
      this.bus.on('state', (s) => this.applyState(s)),
      this.bus.on('slept', () => this.nap()),
      this.bus.on('goto', (g) => this.goTo(g.map, { x: g.x, y: g.y })),
    )
    const state = this.bus.latest('state')
    if (state) this.applyState(state)

    this.time.addEvent({ delay: 3000, loop: true, callback: () => this.savePosition() })

    this.events.once('shutdown', () => {
      this.unsubscribe.forEach((off) => off())
      this.unsubscribe = []
      this.scale.off('resize', this.fitZoom, this)
    })
    this.bus.emit('ready', this.mapName)
  }

  /**
   * A character picture must hold the frames its .json describes. When it
   * does not (a stale copy of either file), the picture is cut as plain 16×32
   * frames instead, so the map still draws rather than stopping on a sheet
   * with no frames in it.
   */
  private checkSheets() {
    for (const [key, sheet] of Object.entries(this.sheets)) {
      if (!sheet || !this.textures.exists(key)) continue
      const texture = this.textures.get(key)
      const frames = texture.frameTotal - 1 // less the whole picture
      const needed = sheet.anims
        ? Math.max(...Object.values(sheet.anims).flat()) + 1
        : CHAR_COLS * (key === 'player' ? CHAR_ROWS.sleep + 1 : CHAR_ROWS.walk + 4)
      if (frames >= needed) continue
      const picture = texture.getSourceImage() as HTMLImageElement
      this.textures.remove(key)
      this.textures.addSpriteSheet(key, picture, { frameWidth: 16, frameHeight: 32 })
      this.sheets[key] = null
    }
  }

  private fitZoom() {
    // In CSS pixels: about 16×11 tiles in view, but never so few pixels that
    // the map stops short of the screen's edge (a tall phone is taller than
    // the map at 2×). The canvas has `density` screen pixels to each of those.
    const width = this.scale.width / this.density
    const height = this.scale.height / this.density
    const view = Math.min(4, Math.floor(Math.min(width / (16 * TILE), height / (11 * TILE))))
    const cover = Math.ceil(Math.max(width / (WIDTH * TILE), height / (HEIGHT * TILE)))
    this.cameras.main.setZoom(Math.min(6, Math.max(2, view, cover)) * this.density)
  }

  /** Animations are the game's, not the scene's: made once, for every map. */
  private makeAnimations() {
    const make = (config: Phaser.Types.Animations.Animation) => {
      if (config.key && !this.anims.exists(config.key)) this.anims.create(config)
    }
    const sheets = ['player', ...ALL_NPC_IDS.map((id) => `npc-${id}`)]
    for (const key of sheets) {
      const anims = this.sheets[key]?.anims
      if (anims) {
        // A drawn sheet names its own animations and how many frames each has.
        for (const [anim, frames] of Object.entries(anims)) {
          const kind = anim.split('-')[0]
          make({
            key: `${key}-${anim}`,
            frames: this.anims.generateFrameNumbers(key, { frames }),
            frameRate: FRAME_RATE[kind] ?? 6,
            repeat: kind === 'hoe' || kind === 'harvest' ? 0 : -1,
          })
        }
        continue
      }
      DIRS.forEach((dir, d) => {
        const row = (r: number) => (r + d) * CHAR_COLS
        make({
          key: `${key}-idle-${dir}`,
          frames: this.anims.generateFrameNumbers(key, { frames: [row(CHAR_ROWS.idle), row(CHAR_ROWS.idle) + 1] }),
          frameRate: 2,
          repeat: -1,
        })
        make({
          key: `${key}-walk-${dir}`,
          frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 2, 3].map((f) => row(CHAR_ROWS.walk) + f) }),
          frameRate: 8,
          repeat: -1,
        })
        if (key !== 'player') return
        // Only the player works the land: three frames each.
        for (const action of ['hoe', 'harvest'] as const) {
          make({
            key: `player-${action}-${dir}`,
            frames: this.anims.generateFrameNumbers(key, { frames: [0, 1, 2].map((f) => row(CHAR_ROWS[action]) + f) }),
            frameRate: 8,
          })
        }
      })
    }
    make({
      key: 'player-sleep',
      frames: this.anims.generateFrameNumbers('player', {
        frames: [CHAR_ROWS.sleep * CHAR_COLS, CHAR_ROWS.sleep * CHAR_COLS + 1],
      }),
      frameRate: 2,
      repeat: -1,
    })
    // The town's fountain, playing; only drawn when its picture is there.
    if (this.present.has('fountain')) {
      make({
        key: 'fountain',
        frames: this.anims.generateFrameNumbers('fountain', { frames: this.strip('fountain', 4) }),
        frameRate: 5,
        repeat: -1,
      })
    }
    make({
      key: 'dust-puff',
      frames: this.anims.generateFrameNumbers('dust', { frames: this.strip('dust', DUST_FRAMES) }),
      frameRate: 12,
    })
    make({
      key: 'sleep-z',
      frames: this.anims.generateFrameNumbers('sleep_z', { frames: this.strip('sleep_z', ZZZ_FRAMES) }),
      frameRate: 3,
      repeat: -1,
    })
    make({
      key: 'interact-bob',
      frames: this.anims.generateFrameNumbers('interact', { frames: [0, 1] }),
      frameRate: 3,
      repeat: -1,
    })
    make({
      key: 'harvest-pop',
      frames: this.anims.generateFrameNumbers('harvest_pop', { frames: this.strip('harvest_pop', POP_FRAMES) }),
      frameRate: 14,
    })
    make({
      key: 'sparkle-twinkle',
      frames: this.anims.generateFrameNumbers('sparkle', { frames: this.strip('sparkle', 4) }),
      frameRate: 5,
      repeat: -1,
    })
    for (const { key, id } of MONSTER_SHEETS) {
      if (!this.textures.exists(key)) continue
      // A sheet of four rows; the stand-in's few frames serve every row.
      const total = this.count(key, MONSTER_FRAMES)
      const cols = total >= MONSTER_ROWS * 2 ? total / MONSTER_ROWS : total
      const row = (r: number) =>
        this.anims.generateFrameNumbers(key, { frames: Array.from({ length: cols }, (_, i) => (cols < total ? r * cols : 0) + i) })
      make({ key: `${key}-idle`, frames: row(0), frameRate: 6, repeat: -1 })
      make({ key: `${key}-move`, frames: row(MONSTER_MOVE_ROW[id]), frameRate: 8, repeat: -1 })
      make({ key: `${key}-hurt`, frames: row(MONSTER_HURT_ROW), frameRate: 10 })
      make({ key: `${key}-down`, frames: row(MONSTER_DOWN_ROW), frameRate: 8 })
    }
  }

  // --- Doing things -----------------------------------------------------------------

  /** The player swings the hoe or picks the crop in front of them. */
  protected act(action: 'hoe' | 'harvest') {
    const key = `player-${action}-${this.facing}`
    this.busyUntil = this.time.now + Math.max(420, this.anims.get(key)?.duration ?? 0)
    this.player.setVelocity(0, 0)
    this.player.play(key)
  }

  /** A nap where the player stands, with Zs drifting up. */
  private nap() {
    const ms = 2200
    this.busyUntil = this.time.now + ms
    this.player.setVelocity(0, 0)
    this.player.play('player-sleep')
    // A drawn sheet has its own yawn and Zs in the sleep row.
    if (this.sheets.player) return
    const z = this.sized(this.add.sprite(this.player.x + 6, this.player.y - 30, 'sleep_z', 0)).setDepth(10_002)
    z.play('sleep-z')
    this.tweens.add({ targets: z, y: z.y - 12, alpha: 0, duration: ms, onComplete: () => z.destroy() })
  }

  /** A puff at the player's heels now and then while they walk. */
  private kickDust() {
    if (this.time.now - this.lastDust < 260) return
    this.lastDust = this.time.now
    const puff = this.sized(this.add.sprite(this.player.x, this.player.y + 1, 'dust', 0)).setOrigin(0.5, 1)
    puff.setDepth(this.player.y - 1)
    puff.play('dust-puff')
    puff.once('animationcomplete', () => puff.destroy())
  }

  private savePosition(force = false) {
    const { x, y } = this.player
    if (!force && Math.abs(x - this.lastSaved.x) + Math.abs(y - this.lastSaved.y) < TILE) return
    this.lastSaved = { x, y }
    this.bus.emit('moved', { map: this.mapName, x: Math.round(x), y: Math.round(y) })
  }

  /** Off to another map (or another spot on this one). */
  protected goTo(map: MapName, at: { x: number; y: number }) {
    if (map === this.mapName) {
      this.player.setPosition(at.x, at.y)
      this.lastSaved = { ...at }
      return
    }
    if (this.leaving) return
    this.leaving = true
    this.bus.emit('moved', { map, x: Math.round(at.x), y: Math.round(at.y) })
    this.cameras.main.fadeOut(180, 0, 0, 0)
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start(map, { ...this.setup, sheets: this.sheets, start: at })
    })
  }

  /** Walking into a gate goes through it, if it is open. */
  private checkGates() {
    for (const gate of this.gates()) {
      if (!inRect(this.player.x / TILE, (this.player.y - 2) / TILE, gate.rect)) continue
      const closed =
        (gate.to === 'woods' && !this.state?.profile.woodsOpen) || (gate.to === 'town' && !this.state?.profile.townOpen)
      if (closed) {
        // Not yet: a step back from the edge, and a word about why, once in a while.
        const { x, y } = gate.rect
        if (x === 0) this.player.x += 6
        else if (x >= WIDTH - 1) this.player.x -= 6
        else if (y === 0) this.player.y += 6
        else this.player.y -= 6
        if (this.time.now - this.blockedAt > 2500) {
          this.blockedAt = this.time.now
          this.bus.emit('blocked', gate.to === 'town' ? 'town_locked' : 'woods_locked')
        }
        return
      }
      this.goTo(gate.to, gate.at)
      return
    }
  }

  update() {
    if (this.leaving) {
      this.player.setVelocity(0, 0)
      return
    }
    if (this.time.now < this.busyUntil) {
      this.player.setVelocity(0, 0)
      this.bus.actionPressed = false
      return
    }
    const k = this.keys
    let vx = 0
    let vy = 0
    if (!this.bus.paused) {
      if (k && !typing()) {
        if (k.left.isDown || k.a.isDown) vx -= 1
        if (k.right.isDown || k.d.isDown) vx += 1
        if (k.up.isDown || k.w.isDown) vy -= 1
        if (k.down.isDown || k.s.isDown) vy += 1
      }
      vx += this.bus.joy.x
      vy += this.bus.joy.y
    }
    const len = Math.hypot(vx, vy)
    if (len > 0.15) {
      const scale = SPEED / Math.max(1, len)
      this.player.setVelocity(vx * scale, vy * scale)
      this.facing = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 'left' : 'right') : vy < 0 ? 'up' : 'down'
      this.player.play(`player-walk-${this.facing}`, true)
      this.kickDust()
    } else {
      this.player.setVelocity(0, 0)
      this.player.play(`player-idle-${this.facing}`, true)
    }
    this.player.setDepth(this.player.y)
    this.checkGates()
    this.tick()

    const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.facing]
    const target = this.bus.paused
      ? null
      : this.targetAt(this.player.x + dir[0] * REACH, this.player.y - 4 + dir[1] * REACH)
    if (!sameTarget(target, this.focused)) {
      this.focused = target
      this.bus.emit('focus', target)
    }
    if (target) {
      const at = this.markerFor(target)
      this.focusMarker.setPosition(at.x, at.y).setVisible(true)
    } else {
      this.focusMarker.setVisible(false)
    }

    const pressed = this.bus.actionPressed
    this.bus.actionPressed = false
    if (pressed && target && !this.bus.paused) {
      this.player.setVelocity(0, 0)
      this.bus.emit('interact', target)
    }
  }
}

/** Keys typed into a field — the tutor's chat, say — are words, not moves. */
function typing(): boolean {
  const el = document.activeElement
  return el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

/** Space and Enter on a focused button press the button, not the farm. */
function typingOrOnControl(): boolean {
  const el = document.activeElement
  return typing() || (el instanceof HTMLElement && /^(BUTTON|A)$/.test(el.tagName))
}
