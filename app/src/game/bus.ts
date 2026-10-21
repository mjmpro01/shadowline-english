/**
 * How the game scene and the React screen around it talk.
 *
 * The scene draws and moves; React holds the farm the server sent, the panels
 * and the dialogue. Neither imports the other: this is a few named events and
 * the joystick's vector, and it keeps Phaser out of every React module but the
 * one that starts it.
 */

import type { GameState } from './api'

/** Something the player can stand next to and act on. */
export type Target =
  | { kind: 'plot'; idx: number }
  | { kind: 'npc'; id: NpcId }
  | { kind: 'house' }
  | { kind: 'mailbox' }
  | { kind: 'board' }
  | { kind: 'monster'; spawn: string; monster: string }
  /** The troll's lair, while nothing lives in it yet. */
  | { kind: 'lair' }

export type NpcId = 'sir_shadow' | 'mira' | 'bram' | 'elsa' | 'orin' | 'lina' | 'hugo' | 'vy'
export type MapName = 'farm' | 'woods' | 'town'

export function sameTarget(a: Target | null, b: Target | null): boolean {
  if (a === null || b === null) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === 'plot' && b.kind === 'plot') return a.idx === b.idx
  if (a.kind === 'npc' && b.kind === 'npc') return a.id === b.id
  if (a.kind === 'monster' && b.kind === 'monster') return a.spawn === b.spawn
  return true
}

interface Events {
  /** The thing in front of the player changed (null: nothing). */
  focus: Target | null
  /** The player pressed the action key or button. */
  interact: Target
  /** The player has walked somewhere worth remembering, on which map. */
  moved: { map: MapName; x: number; y: number }
  /** The player walked into a gate that will not open yet. */
  blocked: 'woods_locked' | 'town_locked'
  /** Put the player somewhere, on whichever map (after fainting: home). */
  goto: { map: MapName; x: number; y: number }
  /** A map's scene finished building and is drawing. */
  ready: MapName
  /** The farm as the server last sent it, for the scene to draw. */
  state: GameState
  /** Who has something to say about the story: a "!" over their head, or a
   *  "?" when what they asked for is done. */
  questGiver: { giver: string | null; done: boolean }
  /** A plot was just harvested: a little burst over it. */
  harvested: number
  /** A seed just went into a plot: the player swings the hoe. */
  planted: number
  /** The player just slept: a nap where they stand. */
  slept: undefined
}

type Listener<T> = (value: T) => void

export class GameBus {
  private listeners = new Map<keyof Events, Set<Listener<never>>>()

  /** The on-screen joystick, -1..1 on each axis. */
  joy = { x: 0, y: 0 }
  /** True while a panel or dialogue is open: the player stands still. */
  paused = false
  /** Pressed on the phone's action button; read and cleared by the scene. */
  actionPressed = false

  setJoy(x: number, y: number) {
    this.joy = { x, y }
  }

  press() {
    this.actionPressed = true
  }

  setPaused(paused: boolean) {
    this.paused = paused
  }

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(fn as Listener<never>)
    return () => {
      set.delete(fn as Listener<never>)
    }
  }

  /** The last value of each event, for a scene that starts listening late. */
  private last: Partial<Events> = {}

  latest<K extends keyof Events>(event: K): Events[K] | undefined {
    return this.last[event]
  }

  emit<K extends keyof Events>(event: K, value: Events[K]) {
    this.last[event] = value
    this.listeners.get(event)?.forEach((fn) => (fn as Listener<Events[K]>)(value))
  }
}
