import Phaser from 'phaser'
import { TREE_KINDS } from '../assets'
import type { NpcId, Target } from '../bus'
import { FROM_TOWN, TILE } from '../world/farm'
import {
  BUILDINGS,
  FROM_FARM_TO_TOWN,
  HALL_DOOR,
  TOWN_GATE,
  TOWN_NPCS,
  TOWN_TREES,
  townBorderTrees,
  townDecor,
  townGround,
  townSolids,
  WORD_HALL,
  door,
} from '../world/town'
import { MapScene } from './MapScene'

/** What each house says over its door, in the town's own English. */
const SIGNS: Record<string, string> = {
  town_hall: 'Town Hall',
  clinic: 'Clinic',
  tower: 'Sound Tower',
  library: 'Library',
  cafe: 'Café',
}

/** The library's door, where Lina's shelves are. */
const LIBRARY_DOOR = door(BUILDINGS.find((b) => b.id === 'library')!)

/**
 * Echo Town: the square, the fountain, and five people at their doors. Walking
 * up to one and pressing the action key opens a chat; the screen around the
 * scene runs it.
 */
export class TownScene extends MapScene {
  readonly mapName = 'town' as const
  private npcs = new Map<NpcId, Phaser.GameObjects.Sprite>()

  constructor() {
    super('town')
  }

  protected arrival() {
    return FROM_FARM_TO_TOWN
  }

  protected gates() {
    return [{ rect: TOWN_GATE, to: 'farm' as const, at: FROM_TOWN }]
  }

  protected buildWorld() {
    this.npcs = new Map()
    this.drawGround(townGround(this.names))
    for (const d of townDecor(this.names)) {
      this.sized(this.add.image(d.x * TILE, d.y * TILE, 'tiles', d.index).setOrigin(0, 0).setDepth(0.5))
    }
    for (const b of BUILDINGS) {
      const x = (b.rect.x + b.rect.w / 2) * TILE
      const foot = (b.rect.y + b.rect.h) * TILE
      this.stand('farmhouse', x, foot).setTint(b.tint)
      this.add
        .text(x, b.rect.y * TILE + 2, SIGNS[b.id], {
          fontFamily: 'Georgia, serif',
          fontSize: '28px',
          color: '#fff8e7',
          backgroundColor: '#5b3a1e',
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0.5, 0)
        .setScale(0.25)
        .setDepth(foot + 1)
    }
    this.drawHall()
    ;[...TOWN_TREES, ...townBorderTrees()].forEach((t, i) =>
      this.stand('tree', (t.x + 0.5) * TILE, (t.y + 1) * TILE, (t.x * 3 + t.y * 5 + i) % this.count('tree', TREE_KINDS)),
    )
    for (const r of townSolids()) this.wall(r)

    for (const npc of TOWN_NPCS) {
      const key = `npc-${npc.id}`
      const sheet = this.sheets[key]
      const sprite = this.sized(this.add.sprite((npc.x + 0.5) * TILE, (npc.y + 1) * TILE, key, 0))
      sprite.setOrigin(0.5, sheet ? sheet.feet / sheet.frameHeight : 1)
      sprite.setDepth(sprite.y)
      sprite.play(`npc-${npc.id}-idle-down`)
      this.npcs.set(npc.id, sprite)
      this.walls.add(this.add.zone(sprite.x, sprite.y - 4, 12, 8))
    }

    this.unsubscribe.push(this.bus.on('questGiver', (g) => this.showQuestGiver(g.giver, g.done)))
    this.time.delayedCall(0, () => {
      const giver = this.bus.latest('questGiver')
      if (giver) this.showQuestGiver(giver.giver, giver.done)
    })
  }

  /** The Word Hall, until it is drawn: the farmhouse grown larger and gone
   *  grey, a hush of mist drifting over it, and the Lexi's notes on its door. */
  private drawHall() {
    const x = (WORD_HALL.x + WORD_HALL.w / 2) * TILE
    const foot = (WORD_HALL.y + WORD_HALL.h) * TILE
    const hall = this.stand('farmhouse', x, foot).setTint(0x9089a6)
    hall.setScale(hall.scaleX * 1.2, hall.scaleY * 1.1)
    for (let i = 0; i < 3; i++) {
      const mist = this.add.ellipse(x + (i - 1) * 26, foot - 30 - i * 8, 70, 22, 0x6b5f8a, 0.28).setDepth(foot + 2)
      this.tweens.add({ targets: mist, x: mist.x + 10, alpha: 0.12, duration: 2600 + i * 500, yoyo: true, repeat: -1 })
    }
    // Three notes pinned to the door.
    for (let i = 0; i < 3; i++) {
      this.add
        .rectangle((HALL_DOOR.x + 0.25 + i * 0.25) * TILE, foot - 14 + (i % 2) * 3, 3, 4, 0xfff8e7)
        .setDepth(foot + 1)
    }
    this.add
      .text(x, WORD_HALL.y * TILE + 2, 'Word Hall', {
        fontFamily: 'Georgia, serif',
        fontSize: '28px',
        color: '#e8e2f5',
        backgroundColor: '#3b3355',
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 0)
      .setScale(0.25)
      .setDepth(foot + 1)
  }

  /** The story's marker over whoever in town has something to say. */
  private showQuestGiver(giver: string | null, done: boolean) {
    if (!this.questMarker) return
    const npc = giver ? this.npcs.get(giver as NpcId) : undefined
    this.questMarker.setVisible(npc !== undefined)
    if (npc) this.questMarker.setPosition(npc.x, npc.y - 36).setTint(done ? 0x81c784 : 0xffd54f)
  }

  protected targetAt(rx: number, ry: number): Target | null {
    for (const [id, sprite] of this.npcs) {
      if (Math.hypot(rx - sprite.x, ry - (sprite.y - 6)) <= 14) return { kind: 'npc', id }
    }
    const near = (d: { x: number; y: number }) => Math.hypot(rx - (d.x + 0.5) * TILE, ry - d.y * TILE) <= 12
    if (near(HALL_DOOR)) return { kind: 'hall' }
    if (near(LIBRARY_DOOR)) return { kind: 'library' }
    return null
  }

  protected markerFor(target: Target): { x: number; y: number } {
    if (target.kind === 'npc') {
      const s = this.npcs.get(target.id)
      if (s) return { x: s.x, y: s.y - 36 }
    }
    if (target.kind === 'hall') return { x: (HALL_DOOR.x + 0.5) * TILE, y: HALL_DOOR.y * TILE - 30 }
    if (target.kind === 'library') return { x: (LIBRARY_DOOR.x + 0.5) * TILE, y: LIBRARY_DOOR.y * TILE - 30 }
    return { x: 0, y: 0 }
  }
}
