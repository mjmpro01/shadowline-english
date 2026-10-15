import Phaser from 'phaser'
import { NPC_IDS, artManifest, characterSheet, presentAssets, tileNames, type CharacterSheet } from './assets'
import type { GameBus } from './bus'
import { FarmScene } from './scenes/FarmScene'

/**
 * Starts the game inside `parent`. The only module that imports Phaser at the
 * top, and itself imported lazily by the Arena screen, so the engine is a chunk
 * of its own that no other screen downloads.
 *
 * The canvas holds a pixel for every pixel of the screen (up to 2× density),
 * so pictures drawn finer than the map's grid stay sharp on a phone.
 */
export async function createGame(
  parent: HTMLElement,
  bus: GameBus,
  start: { x: number; y: number } | null,
): Promise<Phaser.Game> {
  const people = ['player', ...NPC_IDS]
  const [present, tiles, manifest, ...sheets] = await Promise.all([
    presentAssets(),
    tileNames(),
    artManifest(),
    ...people.map(characterSheet),
  ])
  const sheetOf: Record<string, CharacterSheet | null> = {}
  people.forEach((id, i) => {
    const key = id === 'player' ? 'player' : `npc-${id}`
    sheetOf[key] = present.has(key) ? sheets[i] : null
  })

  const fineTiles = present.has('tiles') && tiles !== null ? tiles : null

  const density = Math.min(2, window.devicePixelRatio || 1)
  const size = () => ({
    width: Math.max(1, Math.round((parent.clientWidth || 640) * density)),
    height: Math.max(1, Math.round((parent.clientHeight || 400) * density)),
  })
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    backgroundColor: '#7cb342',
    scale: { mode: Phaser.Scale.NONE, ...size(), zoom: 1 / density },
    physics: { default: 'arcade', arcade: { debug: false } },
    audio: { noAudio: true },
    banner: false,
  })
  const observer = new ResizeObserver(() => {
    const { width, height } = size()
    game.scale.resize(width, height)
    game.scale.setZoom(1 / density)
  })
  observer.observe(parent)
  game.events.once(Phaser.Core.Events.DESTROY, () => observer.disconnect())

  game.scene.add('farm', FarmScene, true, {
    bus,
    present,
    start,
    tiles: tiles?.names ?? {},
    // A stand-in tileset is painted at 16px with nothing between its cells.
    tileSize: fineTiles ? fineTiles.size : 16,
    tileGap: fineTiles ? { margin: fineTiles.margin, spacing: fineTiles.spacing } : { margin: 0, spacing: 0 },
    art: manifest,
    sheets: sheetOf,
    density,
  })
  return game
}
