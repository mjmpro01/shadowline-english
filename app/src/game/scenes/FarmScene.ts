import Phaser from 'phaser'
import type { GameState, Plot } from '../api'
import { CROP_STAGES, NPC_IDS, TREE_KINDS } from '../assets'
import type { Target } from '../bus'
import { cropStage } from '../growth'
import {
  BENCH,
  BOARD,
  CART,
  FARM_GATE,
  HOUSE,
  HOUSE_DOOR,
  MAILBOX,
  NPCS,
  ROCKS,
  SPAWN,
  TILE,
  TREES,
  borderTrees,
  decor,
  fence,
  ground,
  plotRect,
  solids,
  tile,
  type Rect,
} from '../world/farm'
import { FROM_FARM } from '../world/woods'
import { MapScene } from './MapScene'

const PLOTS = 12
/** The richest soil the tileset draws; the hammer's level is that, glowing. */
const MAX_DRAWN_LEVEL = 3

interface PlotView {
  soil: Phaser.GameObjects.Image
  crop: Phaser.GameObjects.Sprite
  /** Twinkles over a crop that is ready to pick. */
  ripe: Phaser.GameObjects.Sprite
  /** A golden rim on soil worked with Bram's hammer. */
  rich: Phaser.GameObjects.Rectangle
  rect: Rect
}

/**
 * The farm: the plots, the house, the people, and the gate east to the woods.
 *
 * What a plot holds comes from the server through the bus, and pressing the
 * action key only tells the screen around it what was pressed on.
 */
export class FarmScene extends MapScene {
  readonly mapName = 'farm' as const
  private plots: PlotView[] = []
  private npcs = new Map<string, Phaser.GameObjects.Sprite>()

  constructor() {
    super('farm')
  }

  protected arrival() {
    return SPAWN
  }

  protected gates() {
    return [{ rect: FARM_GATE, to: 'woods' as const, at: FROM_FARM }]
  }

  protected buildWorld() {
    this.plots = []
    this.npcs = new Map()
    this.drawGround(ground(this.names))
    for (const d of decor(this.names)) {
      this.sized(this.add.image(d.x * TILE, d.y * TILE, 'tiles', d.index).setOrigin(0, 0).setDepth(0.5))
    }
    // The fence stands up, so the player passes behind its top rail.
    for (const f of fence(this.names)) {
      this.sized(this.add.image(f.x * TILE, (f.y + 1) * TILE, 'tiles', f.index))
        .setOrigin(0, 1)
        .setDepth((f.y + 1) * TILE)
    }

    this.stand('farmhouse', (HOUSE.x + HOUSE.w / 2) * TILE, (HOUSE.y + HOUSE.h) * TILE)
    this.stand('shop_cart', (CART.x + CART.w / 2) * TILE, (CART.y + CART.h) * TILE)
    this.stand('workbench', (BENCH.x + BENCH.w / 2) * TILE, (BENCH.y + BENCH.h) * TILE)
    this.stand('quest_board', (BOARD.x + BOARD.w / 2) * TILE, (BOARD.y + BOARD.h) * TILE)
    this.stand('mailbox', (MAILBOX.x + 0.5) * TILE, (MAILBOX.y + 1) * TILE, 0)
    ;[...TREES, ...borderTrees()].forEach((t, i) =>
      this.stand('tree', (t.x + 0.5) * TILE, (t.y + 1) * TILE, (t.x * 7 + t.y * 3 + i) % this.count('tree', TREE_KINDS)),
    )
    ROCKS.forEach((r, i) => this.stand(i % 2 ? 'stump' : 'rock_big', (r.x + 0.5) * TILE, (r.y + 1) * TILE))

    for (const r of solids()) this.wall(r)

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
      const rich = this.add
        .rectangle(rect.x * TILE + 1, rect.y * TILE + 1, rect.w * TILE - 2, rect.h * TILE - 2)
        .setOrigin(0, 0)
        .setStrokeStyle(1.5, 0xffd54f, 1)
        .setDepth(1.1)
        .setVisible(false)
      this.tweens.add({ targets: rich, alpha: 0.35, duration: 900, yoyo: true, repeat: -1 })
      this.plots.push({ soil, crop, ripe, rich, rect })
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
      this.walls.add(this.add.zone(sprite.x, sprite.y - 4, 12, 8))
    }

    this.unsubscribe.push(
      this.bus.on('questGiver', (g) => this.showQuestGiver(g.giver, g.done)),
      this.bus.on('harvested', (idx) => {
        this.burst(idx)
        this.act('harvest')
      }),
      this.bus.on('planted', () => this.act('hoe')),
    )
    // Crops grow while the farm is open.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.drawPlots() })
    // Once the markers exist (made after the world), point at the story.
    this.time.delayedCall(0, () => {
      const giver = this.bus.latest('questGiver')
      if (giver) this.showQuestGiver(giver.giver, giver.done)
    })
  }

  protected applyState(state: GameState) {
    super.applyState(state)
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
      else if (plot.level > 0) soil = `soil_level_${Math.min(plot.level, MAX_DRAWN_LEVEL)}`
      else soil = plot.crop ? 'tilled_wet' : 'tilled_dry'
      view.soil.setFrame(tile(this.names, soil))
      // Soil worked with Bram's hammer is the richest drawn, warmer, in a
      // golden rim.
      const rich = plot.level > MAX_DRAWN_LEVEL
      if (rich) view.soil.setTint(0xffd98a)
      else view.soil.clearTint()
      view.rich.setVisible(rich)
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

  /** Puts the story's marker over whoever has something to say. */
  private showQuestGiver(giver: string | null, done: boolean) {
    if (!this.questMarker) return
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

  protected targetAt(rx: number, ry: number): Target | null {
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

  protected markerFor(target: Target): { x: number; y: number } {
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
      default:
        return { x: 0, y: 0 }
    }
  }
}
