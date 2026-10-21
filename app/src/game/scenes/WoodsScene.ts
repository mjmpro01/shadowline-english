import Phaser from 'phaser'
import type { GameState } from '../api'
import { TREE_KINDS, monsterColour } from '../assets'
import type { Target } from '../bus'
import { FROM_WOODS, TILE } from '../world/farm'
import { inRect } from '../world/farm'
import { FROM_FARM, LAIR, LAIR_ROCKS, WOOD_TREES, WOODS_GATE, woodsDecor, woodsGround, woodsSolids } from '../world/woods'
import { MapScene } from './MapScene'

/** How far a monster wanders from its spot, in map pixels. */
const WANDER = 18
/** How close the player comes before a monster stops to face them. */
const NOTICE = 40

interface MonsterView {
  spawn: string
  monster: string
  home: { x: number; y: number }
  sprite: Phaser.GameObjects.Sprite
  /** Its sheet: the monster's own, or one of the slime's colours. */
  key: string
  /** When it is back after being beaten (ms since epoch, server time); 0 when here. */
  backAt: number
  /** Beaten while the fight was on screen: it goes down once the panel closes. */
  falling: boolean
}

/**
 * The Whispering Woods: darker grass, close trees, and monsters wandering
 * near their spots. Walking up to one and pressing the action key starts a
 * fight; the screen around the scene runs it.
 */
export class WoodsScene extends MapScene {
  readonly mapName = 'woods' as const
  private monsters: MonsterView[] = []

  constructor() {
    super('woods')
  }

  protected arrival() {
    return FROM_FARM
  }

  protected gates() {
    return [{ rect: WOODS_GATE, to: 'farm' as const, at: FROM_WOODS }]
  }

  protected buildWorld() {
    this.monsters = []
    // The same grass as the farm's, in the shade of the trees.
    this.drawGround(woodsGround(this.names))?.setTint(0xa9c79a)
    for (const d of woodsDecor(this.names)) {
      this.sized(this.add.image(d.x * TILE, d.y * TILE, 'tiles', d.index).setOrigin(0, 0).setDepth(0.5)).setTint(
        0xc8dcc0,
      )
    }
    WOOD_TREES.forEach((t, i) =>
      this.stand('tree', (t.x + 0.5) * TILE, (t.y + 1) * TILE, (t.x * 5 + t.y * 7 + i) % this.count('tree', TREE_KINDS)).setTint(
        0xd4e4cc,
      ),
    )
    LAIR_ROCKS.forEach((r) => this.stand('rock_big', (r.x + 0.5) * TILE, (r.y + 1) * TILE).setTint(0xb8c4b0))
    for (const r of woodsSolids()) this.wall(r)
    // Monsters come from the state; it may already be here.
    if (this.state) this.placeMonsters(this.state)
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.showReturned() })
  }

  protected applyState(state: GameState) {
    super.applyState(state)
    if (this.walls) this.placeMonsters(state)
  }

  /** Puts each spawn's monster on the map, or keeps it away while it is not back. */
  private placeMonsters(state: GameState) {
    for (const sp of state.spawns) {
      let view = this.monsters.find((m) => m.spawn === sp.id)
      if (!view) {
        const home = { x: (sp.x + 0.5) * TILE, y: (sp.y + 1) * TILE }
        const key = this.sheetFor(sp.id, sp.monster)
        const sprite = this.sized(this.add.sprite(home.x, home.y, key, 0).setOrigin(0.5, 1))
        sprite.play(`${key}-idle`)
        sprite.setDepth(home.y)
        const backAt = sp.respawnAt ? Date.parse(sp.respawnAt) : 0
        view = { spawn: sp.id, monster: sp.monster, home, sprite, key, backAt, falling: false }
        sprite.setVisible(backAt === 0)
        this.monsters.push(view)
        this.wander(view)
        continue
      }
      const backAt = sp.respawnAt ? Date.parse(sp.respawnAt) : 0
      // Just beaten: it stays where it was until it has gone down.
      if (backAt && !view.backAt && view.sprite.visible) view.falling = true
      view.backAt = backAt
      if (!view.falling) view.sprite.setVisible(backAt === 0)
    }
  }

  /** The monster's sheet, in its spot's colour when that one is drawn. */
  private sheetFor(spawn: string, monster: string): string {
    const own = `monster-${monster}`
    const colour = monsterColour(spawn, monster)
    return colour && this.textures.exists(`${own}-${colour}`) ? `${own}-${colour}` : own
  }

  /** Hit, down, gone. */
  private fall(m: MonsterView) {
    m.falling = false
    this.tweens.killTweensOf(m.sprite)
    m.sprite.play(`${m.key}-hurt`)
    m.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      m.sprite.play(`${m.key}-down`)
      m.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.tweens.add({
          targets: m.sprite,
          alpha: 0,
          delay: 300,
          duration: 400,
          onComplete: () => {
            // Back on its spot, out of sight, for when it returns.
            m.sprite.setVisible(false).setAlpha(1).setPosition(m.home.x, m.home.y).play(`${m.key}-idle`)
            this.wander(m)
          },
        })
      })
    })
  }

  /** Monsters beaten a while ago come back on time, with no word from the server. */
  private showReturned() {
    const now = Date.now() + this.clockSkew
    for (const m of this.monsters) {
      if (m.backAt && m.backAt <= now && !m.falling && !m.sprite.visible) {
        m.backAt = 0
        m.sprite.setVisible(true).setAlpha(0).play(`${m.key}-idle`)
        this.tweens.add({ targets: m.sprite, alpha: 1, duration: 400 })
      }
    }
  }

  /** A little walk near home, a pause, another. */
  private wander(m: MonsterView) {
    // The troll keeps to its lair.
    const range = m.monster === 'mumble_troll' ? WANDER / 3 : WANDER
    const to = {
      x: m.home.x + Phaser.Math.Between(-range, range),
      y: m.home.y + Phaser.Math.Between(-range / 2, range / 2),
    }
    this.tweens.add({
      targets: m.sprite,
      x: to.x,
      y: to.y,
      duration: Phaser.Math.Between(1200, 2200),
      delay: Phaser.Math.Between(400, 1600),
      onStart: () => {
        m.sprite.setFlipX(to.x < m.sprite.x)
        m.sprite.play(`${m.key}-move`, true)
      },
      onUpdate: () => m.sprite.setDepth(m.sprite.y),
      onComplete: () => {
        m.sprite.play(`${m.key}-idle`, true)
        this.wander(m)
      },
    })
  }

  protected targetAt(rx: number, ry: number): Target | null {
    // Until the story sends the player after it, the troll's lair is empty.
    const lairEmpty = !this.monsters.some((m) => m.monster === 'mumble_troll')
    if (lairEmpty && inRect(rx / TILE, ry / TILE, LAIR)) return { kind: 'lair' }
    for (const m of this.monsters) {
      if (!m.sprite.visible || m.backAt) continue
      // A big monster is reached anywhere in front of it.
      const reach = Math.max(24, m.sprite.displayWidth / 2)
      if (Math.hypot(rx - m.sprite.x, ry - (m.sprite.y - 6)) <= reach) {
        return { kind: 'monster', spawn: m.spawn, monster: m.monster }
      }
    }
    return null
  }

  protected markerFor(target: Target): { x: number; y: number } {
    if (target.kind === 'monster') {
      const m = this.monsters.find((v) => v.spawn === target.spawn)
      if (m) return { x: m.sprite.x, y: m.sprite.y - m.sprite.displayHeight - 6 }
    }
    if (target.kind === 'lair') return { x: (LAIR.x + LAIR.w / 2) * TILE, y: LAIR.y * TILE - 4 }
    return { x: 0, y: 0 }
  }

  /** A monster stays still while the player fights it, and stops to face
   *  a player who comes close, so it is there to be fought. */
  protected tick() {
    for (const m of this.monsters) {
      if (m.falling) {
        if (!this.bus.paused) this.fall(m)
        continue
      }
      if (m.backAt) continue
      const near = Math.hypot(this.player.x - m.sprite.x, this.player.y - m.sprite.y) < NOTICE
      const tweens = this.tweens.getTweensOf(m.sprite)
      if (this.bus.paused || near) {
        tweens.forEach((t) => t.pause())
        m.sprite.play(`${m.key}-idle`, true)
      } else if (tweens.some((t) => t.isPaused())) {
        tweens.forEach((t) => t.resume())
        if (tweens.some((t) => t.hasStarted)) m.sprite.play(`${m.key}-move`, true)
      }
      if (near && !this.bus.paused) m.sprite.setFlipX(this.player.x < m.sprite.x)
    }
  }
}
