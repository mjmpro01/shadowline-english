import type { Bilingual, GameState } from './api'

/**
 * The pure parts of Echo Town on screen: hearts, gifts in the bag, keys. No
 * React, no Phaser, so they are tested on their own.
 */

/** As the server counts them (game.PointsPerHeart, game.MaxHearts). */
export const POINTS_PER_HEART = 100
export const MAX_HEARTS = 10

/** The gifts in the bag, with how many of each. */
export function giftsInBag(state: Pick<GameState, 'shop' | 'inventory'>): { id: string; name: Bilingual; qty: number }[] {
  return state.shop
    .filter((item) => item.kind === 'gift' && (state.inventory[item.id] ?? 0) > 0)
    .map((item) => ({ id: item.id, name: item.name, qty: state.inventory[item.id] }))
}

/** A number key 1–n as a reply's index, or -1. */
export function replyKey(key: string, replies: number): number {
  const n = Number(key)
  return Number.isInteger(n) && n >= 1 && n <= replies ? n - 1 : -1
}
