import Phaser from 'phaser'
import { presentAssets, tileNames } from './assets'
import type { GameBus } from './bus'
import { FarmScene } from './scenes/FarmScene'

/**
 * Starts the game inside `parent`. The only module that imports Phaser at the
 * top, and itself imported lazily by the Arena screen, so the engine is a chunk
 * of its own that no other screen downloads.
 */
export async function createGame(
  parent: HTMLElement,
  bus: GameBus,
  start: { x: number; y: number } | null,
): Promise<Phaser.Game> {
  const [present, tiles] = await Promise.all([presentAssets(), tileNames()])
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    backgroundColor: '#7cb342',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 640,
      height: parent.clientHeight || 400,
    },
    physics: { default: 'arcade', arcade: { debug: false } },
    audio: { noAudio: true },
    banner: false,
  })
  game.scene.add('farm', FarmScene, true, { bus, present, start, tiles: tiles ?? {} })
  return game
}
