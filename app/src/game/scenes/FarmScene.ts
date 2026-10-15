import Phaser from 'phaser'
import type { GameState, Plot } from '../api'
import {
  ASSETS,
  type ArtManifest,
  type CharacterSheet,
  art,
  CHAR_COLS,
  CHAR_ROWS,
  CROP_STAGES,
  DIRS,
  DUST_FRAMES,
  NPC_IDS,
  POP_FRAMES,
  TREE_KINDS,
  ZZZ_FRAMES,
  type Dir,
} from '../assets'
import { paintPlaceholders } from '../art/placeholder'
import { sameTarget, type GameBus, type Target } from '../bus'
import { cropStage } from '../growth'
import {
  BENCH,
  BOARD,
  CART,
  HEIGHT,
  HOUSE,
  HOUSE_DOOR,
  MAILBOX,
  NPCS,
  ROCKS,
  SPAWN,
  TILE,
  TREES,
  WIDTH,
  borderTrees,
  decor,
  fence,
  ground,
  plotRect,
  solids,
  tile,
  type Rect,
  type TileNames,
} from '../world/farm'

export interface FarmSceneData {
  bus: GameBus
  present: Set<string>
  /** Where the player stood last time, or null for the front door. */
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
const REACH = 12
const PLOTS = 12
/** Frames a second for each kind of animation in a drawn sheet. */
const FRAME_RATE: Record<string, number> = { idle: 2, walk: 9, hoe: 6, harvest: 8, sleep: 1.5 }

interface PlotView {
  soil: Phaser.GameObjects.Image
  crop: Phaser.GameObjects.Sprite
  /** Twinkles over a crop that is ready to pick. */
  ripe: Phaser.GameObjects.Sprite
  rect: Rect
}

/**
 * The farm: the map, the player walking it, the plots and the people on it.
 *
 * It draws and moves and says what the player is facing; it does not decide
 * anything. What a plot holds comes from the server through the bus, and
 * pressing the action key only tells the screen around it what was pressed on.
 */
export class FarmScene extends Phaser.Scene {
  private bus!: GameBus
  private present!: Set<string>
  private start: { x: number; y: number } | null = null
  private names: TileNames = {}
  private tileSize = TILE
  private tileGap = { margin: 0, spacing: 0 }
  private artInfo: ArtManifest | null = null
  private sheets: Record<string, CharacterSheet | null> = {}
  private density = 1

  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody
  private facing: Dir = 'down'
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>
  private plots: PlotView[] = []
  private npcs = new Map<string, Phaser.GameObjects.Sprite>()
  private focusMarker!: Phaser.GameObjects.Sprite
  private questMarker!: Phaser.GameObjects.Sprite
  private focused: Target | null = null
  private state: GameState | null = null
  /** Server clock minus this browser's, so growth is drawn by the server's time. */
  private clockSkew = 0
  private lastSaved = { x: 0, y: 0 }
  /** Until when the player is busy with the hoe, a harvest or a nap and
   *  stays put (scene time, ms). */
  private busyUntil = 0
  private lastDust = 0
  private unsubscribe: (() => void)[] = []

  constructor() {
    super('farm')
  }

  init(data: FarmSceneData) {
    this.bus = data.bus
    this.present = data.present
    this.start = data.start
    this.names = data.tiles
    this.tileSize = data.tileSize
    this.tileGap = data.tileGap
    this.artInfo = data.art
    this.sheets = { ...data.sheets }
    this.density = data.density
  }

  preload() {
    for (const asset of ASSETS) {
      if (!this.present.has(asset.key)) continue
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

  /** How much a picture is shrunk to sit on the map: 1 for one drawn at the
   *  map's size (and for every stand-in painted in code). */
  private shrink(key: string): number {
    const sheet = this.sheets[key]
    if (sheet) return PERSON_HEIGHT / sheet.bodyHeight
    if (key === 'tiles') return TILE / this.tileSize
    return this.artInfo && this.present.has(key) ? 1 / this.artInfo.scale : 1
  }

  /** Frames in a strip: the art's count when it is drawn fine, else ours. */
  private count(key: string, fallback: number): number {
    return (this.present.has(key) && this.artInfo?.frames[key]?.count) || fallback
  }

  /** 0, 1, … for each frame in a strip. */
  private strip(key: string, fallback: number): number[] {
    return Array.from({ length: this.count(key, fallback) }, (_, i) => i)
  }

  /** Puts a picture on the map at the map's size. */
  private sized<T extends Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>(obj: T): T {
    const k = this.shrink(obj.texture.key)
    if (k !== 1) obj.setScale(k)
    return obj
  }

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

    // The ground, and the flowers and mushrooms dotted on it.
    const cells = ground(this.names)
    const ts = this.tileSize
    const map = this.make.tilemap({
      data: cells.map((row) => row.map((c) => c.index)),
      tileWidth: ts,
      tileHeight: ts,
    })
    const tiles = map.addTilesetImage('tiles', 'tiles', ts, ts, this.tileGap.margin, this.tileGap.spacing)
    const layer = tiles ? map.createLayer(0, tiles, 0, 0) : null
    if (layer) {
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
    }
    for (const d of decor(this.names)) {
      this.sized(this.add.image(d.x * TILE, d.y * TILE, 'tiles', d.index).setOrigin(0, 0).setDepth(0.5))
    }
    // The fence stands up, so the player passes behind its top rail.
    for (const f of fence(this.names)) {
      this.sized(this.add.image(f.x * TILE, (f.y + 1) * TILE, 'tiles', f.index))
        .setOrigin(0, 1)
        .setDepth((f.y + 1) * TILE)
    }

    // Things that stand on it, drawn in order of how far down the screen
    // their feet are, so the player walks behind a tree and in front of it.
    const stand = (key: string, x: number, y: number, frame?: number) => {
      const img = this.sized(this.add.image(x, y, key, frame).setOrigin(0.5, 1))
      img.setDepth(y)
      return img
    }
    stand('farmhouse', (HOUSE.x + HOUSE.w / 2) * TILE, (HOUSE.y + HOUSE.h) * TILE)
    stand('shop_cart', (CART.x + CART.w / 2) * TILE, (CART.y + CART.h) * TILE)
    stand('workbench', (BENCH.x + BENCH.w / 2) * TILE, (BENCH.y + BENCH.h) * TILE)
    stand('quest_board', (BOARD.x + BOARD.w / 2) * TILE, (BOARD.y + BOARD.h) * TILE)
    stand('mailbox', (MAILBOX.x + 0.5) * TILE, (MAILBOX.y + 1) * TILE, 0)
    ;[...TREES, ...borderTrees()].forEach((t, i) =>
      stand('tree', (t.x + 0.5) * TILE, (t.y + 1) * TILE, (t.x * 7 + t.y * 3 + i) % this.count('tree', TREE_KINDS)),
    )
    ROCKS.forEach((r, i) => stand(i % 2 ? 'stump' : 'rock_big', (r.x + 0.5) * TILE, (r.y + 1) * TILE))

    // What cannot be walked through.
    const walls = this.physics.add.staticGroup()
    for (const r of solids()) {
      const zone = this.add.zone((r.x + r.w / 2) * TILE, (r.y + r.h / 2) * TILE, r.w * TILE, r.h * TILE)
      walls.add(zone)
    }

    // The plots, drawn from whatever the server last said.
    for (let idx = 0; idx < PLOTS; idx++) {
      const rect = plotRect(idx)
      const cx = (rect.x + rect.w / 2) * TILE
      const soil = this.add
        .image(rect.x * TILE, rect.y * TILE, 'tiles', tile(this.names, 'soil_locked'))
        .setOrigin(0, 0)
        .setDisplaySize(rect.w * TILE, rect.h * TILE)
        .setDepth(1)
      const crop = this.add
        .sprite(cx, (rect.y + rect.h) * TILE - 2, 'crop-sprout', 0)
        .setOrigin(0.5, 1)
        .setVisible(false)
      crop.setDepth(crop.y)
      const ripe = this.sized(this.add.sprite(cx + 8, rect.y * TILE + 4, 'sparkle', 0))
        .setDepth(crop.y + 1)
        .setVisible(false)
      ripe.play('sparkle-twinkle')
      this.plots.push({ soil, crop, ripe, rect })
    }

    // The people.
    for (const npc of NPCS) {
      const key = `npc-${npc.id}`
      const sheet = this.sheets[key]
      const sprite = this.sized(this.add.sprite((npc.x + 0.5) * TILE, (npc.y + 1) * TILE, key, 0))
      sprite.setOrigin(0.5, sheet ? sheet.feet / sheet.frameHeight : 1)
      sprite.setDepth(sprite.y)
      sprite.play(`npc-${npc.id}-idle-down`)
      this.npcs.set(npc.id, sprite)
      const body = this.add.zone(sprite.x, sprite.y - 4, 12, 8)
      walls.add(body)
    }

    // The player.
    const from = this.start ?? SPAWN
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
    this.physics.add.collider(this.player, walls)
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
      this.bus.on('questGiver', (g) => this.showQuestGiver(g.giver, g.done)),
      this.bus.on('harvested', (idx) => {
        this.burst(idx)
        this.act('harvest')
      }),
      this.bus.on('planted', () => this.act('hoe')),
      this.bus.on('slept', () => this.nap()),
    )
    const state = this.bus.latest('state')
    if (state) this.applyState(state)
    const giver = this.bus.latest('questGiver')
    if (giver) this.showQuestGiver(giver.giver, giver.done)

    // Crops grow while the farm is open.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.drawPlots() })
    this.time.addEvent({ delay: 3000, loop: true, callback: () => this.savePosition() })

    this.events.once('shutdown', () => {
      this.unsubscribe.forEach((off) => off())
      this.scale.off('resize', this.fitZoom, this)
    })
    this.bus.emit('ready', undefined)
  }

  /**
   * A character picture must hold the frames its .json describes. When it
   * does not (a stale copy of either file), the picture is cut as plain 16×32
   * frames instead, so the farm still draws rather than stopping on a sheet
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

  private makeAnimations() {
    const sheets = ['player', ...NPC_IDS.map((id) => `npc-${id}`)]
    for (const key of sheets) {
      const name = key === 'player' ? 'player' : key
      const anims = this.sheets[key]?.anims
      if (anims) {
        // A drawn sheet names its own animations and how many frames each has.
        for (const [anim, frames] of Object.entries(anims)) {
          const kind = anim.split('-')[0]
          this.anims.create({
            key: `${name}-${anim}`,
            frames: this.anims.generateFrameNumbers(key, { frames }),
            frameRate: FRAME_RATE[kind] ?? 6,
            repeat: kind === 'hoe' || kind === 'harvest' ? 0 : -1,
          })
        }
        continue
      }
      DIRS.forEach((dir, d) => {
        const row = (r: number) => (r + d) * CHAR_COLS
        this.anims.create({
          key: `${name}-idle-${dir}`,
          frames: this.anims.generateFrameNumbers(key, { frames: [row(CHAR_ROWS.idle), row(CHAR_ROWS.idle) + 1] }),
          frameRate: 2,
          repeat: -1,
        })
        this.anims.create({
          key: `${name}-walk-${dir}`,
          frames: this.anims.generateFrameNumbers(key, {
            frames: [0, 1, 2, 3].map((f) => row(CHAR_ROWS.walk) + f),
          }),
          frameRate: 8,
          repeat: -1,
        })
        if (key !== 'player') return
        // Only the player works the land: three frames each.
        for (const action of ['hoe', 'harvest'] as const) {
          this.anims.create({
            key: `player-${action}-${dir}`,
            frames: this.anims.generateFrameNumbers(key, {
              frames: [0, 1, 2].map((f) => row(CHAR_ROWS[action]) + f),
            }),
            frameRate: 8,
          })
        }
      })
    }
    if (!this.anims.exists('player-sleep')) this.anims.create({
      key: 'player-sleep',
      frames: this.anims.generateFrameNumbers('player', {
        frames: [CHAR_ROWS.sleep * CHAR_COLS, CHAR_ROWS.sleep * CHAR_COLS + 1],
      }),
      frameRate: 2,
      repeat: -1,
    })
    this.anims.create({
      key: 'dust-puff',
      frames: this.anims.generateFrameNumbers('dust', { frames: this.strip('dust', DUST_FRAMES) }),
      frameRate: 12,
    })
    this.anims.create({
      key: 'sleep-z',
      frames: this.anims.generateFrameNumbers('sleep_z', { frames: this.strip('sleep_z', ZZZ_FRAMES) }),
      frameRate: 3,
      repeat: -1,
    })
    this.anims.create({
      key: 'interact-bob',
      frames: this.anims.generateFrameNumbers('interact', { frames: [0, 1] }),
      frameRate: 3,
      repeat: -1,
    })
    this.anims.create({
      key: 'harvest-pop',
      frames: this.anims.generateFrameNumbers('harvest_pop', { frames: this.strip('harvest_pop', POP_FRAMES) }),
      frameRate: 14,
    })
    this.anims.create({
      key: 'sparkle-twinkle',
      frames: this.anims.generateFrameNumbers('sparkle', { frames: this.strip('sparkle', 4) }),
      frameRate: 5,
      repeat: -1,
    })
  }

  private applyState(state: GameState) {
    this.state = state
    this.clockSkew = Date.parse(state.now) - Date.now()
    this.drawPlots()
  }

  private drawPlots() {
    if (!this.state) return
    const now = Date.now() + this.clockSkew
    this.state.plots.forEach((plot: Plot) => {
      const view = this.plots[plot.idx]
      if (!view) return
      let soil: string
      if (!plot.unlocked) soil = 'soil_locked'
      else if (plot.level > 0) soil = `soil_level_${plot.level}`
      else soil = plot.crop ? 'tilled_wet' : 'tilled_dry'
      view.soil.setFrame(tile(this.names, soil))
      if (plot.crop && plot.plantedAt && plot.ripeAt) {
        const stage = cropStage(Date.parse(plot.plantedAt), Date.parse(plot.ripeAt), now, CROP_STAGES)
        this.sized(view.crop.setTexture(`crop-${plot.crop}`, stage)).setVisible(true)
        view.ripe.setVisible(stage === CROP_STAGES - 1)
      } else {
        view.crop.setVisible(false)
        view.ripe.setVisible(false)
      }
    })
  }

  private burst(idx: number) {
    const view = this.plots[idx]
    if (!view) return
    const fx = this.sized(this.add.sprite(view.crop.x, view.crop.y - 16, 'harvest_pop', 0)).setDepth(10_002)
    fx.play('harvest-pop')
    fx.once('animationcomplete', () => fx.destroy())
  }

  /** The player swings the hoe or picks the crop in front of them. */
  private act(action: 'hoe' | 'harvest') {
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

  /** Puts the story's marker over whoever has something to say. */
  private showQuestGiver(giver: string | null, done: boolean) {
    let at: { x: number; y: number } | null = null
    const npc = giver ? this.npcs.get(giver) : undefined
    if (npc) at = { x: npc.x, y: npc.y - 36 }
    else if (giver === 'grandma') at = { x: (MAILBOX.x + 0.5) * TILE, y: MAILBOX.y * TILE - 4 }
    this.questMarker.setVisible(at !== null)
    if (at) this.questMarker.setPosition(at.x, at.y).setTint(done ? 0x81c784 : 0xffd54f)
    // The mailbox's flag is up while a letter waits in it.
    this.children.list.forEach((obj) => {
      if (obj instanceof Phaser.GameObjects.Image && obj.texture.key === 'mailbox') {
        obj.setFrame(giver === 'grandma' ? 1 : 0)
      }
    })
  }

  private savePosition() {
    const { x, y } = this.player
    if (Math.abs(x - this.lastSaved.x) + Math.abs(y - this.lastSaved.y) < TILE) return
    this.lastSaved = { x, y }
    this.bus.emit('moved', { x: Math.round(x), y: Math.round(y) })
  }

  /** What the player is facing, if it is something to act on. */
  private findTarget(): Target | null {
    const dir = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.facing]
    const rx = this.player.x + dir[0] * REACH
    const ry = this.player.y - 4 + dir[1] * REACH
    const near = (x: number, y: number, r: number) => Math.hypot(rx - x, ry - y) <= r
    const inside = (rect: Rect, pad: number) =>
      rx >= rect.x * TILE - pad &&
      rx <= (rect.x + rect.w) * TILE + pad &&
      ry >= rect.y * TILE - pad &&
      ry <= (rect.y + rect.h) * TILE + pad

    for (const [id, sprite] of this.npcs) {
      if (near(sprite.x, sprite.y - 6, 14)) return { kind: 'npc', id: id as (typeof NPC_IDS)[number] }
    }
    if (near((HOUSE_DOOR.x + 0.5) * TILE, HOUSE_DOOR.y * TILE, 14)) return { kind: 'house' }
    if (near((MAILBOX.x + 0.5) * TILE, (MAILBOX.y + 0.5) * TILE, 14)) return { kind: 'mailbox' }
    if (inside(BOARD, 4)) return { kind: 'board' }
    if (inside(CART, 4)) return { kind: 'npc', id: 'mira' }
    if (inside(BENCH, 4)) return { kind: 'npc', id: 'bram' }
    for (let idx = 0; idx < this.plots.length; idx++) {
      if (inside(this.plots[idx].rect, 0)) return { kind: 'plot', idx }
    }
    return null
  }

  private markerFor(target: Target): { x: number; y: number } {
    switch (target.kind) {
      case 'plot': {
        const r = this.plots[target.idx].rect
        return { x: (r.x + r.w / 2) * TILE, y: r.y * TILE - 6 }
      }
      case 'npc': {
        const s = this.npcs.get(target.id)!
        return { x: s.x, y: s.y - 36 }
      }
      case 'house':
        return { x: (HOUSE_DOOR.x + 0.5) * TILE, y: (HOUSE.y + HOUSE.h) * TILE - 30 }
      case 'mailbox':
        return { x: (MAILBOX.x + 0.5) * TILE, y: MAILBOX.y * TILE - 4 }
      case 'board':
        return { x: (BOARD.x + BOARD.w / 2) * TILE, y: BOARD.y * TILE - 6 }
    }
  }

  update() {
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

    const target = this.bus.paused ? null : this.findTarget()
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
