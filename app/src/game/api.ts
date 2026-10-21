import { api } from '../lib/api'

/**
 * The Arena's side of the API. The server keeps the farm and decides every
 * outcome; each move answers with the farm as it now stands, so the screen
 * replaces its copy rather than guessing what changed.
 */

export interface Bilingual {
  en: string
  vi: string
}

export interface Crop {
  id: string
  name: Bilingual
  seed: string
  gold: number
  growSeconds: number
}

export interface ShopItem {
  id: string
  name: Bilingual
  kind: 'seed' | 'food' | 'tool'
  price: number
  stamina?: number
  hp?: number
  unlockStep: number
  unlocked: boolean
}

export interface Plot {
  idx: number
  unlocked: boolean
  level: number
  crop: string | null
  plantedAt: string | null
  ripeAt: string | null
}

export interface GameState {
  now: string
  profile: {
    gold: number
    stamina: number
    staminaMax: number
    staminaNextAt: string | null
    hp: number
    hpMax: number
    hpNextAt: string | null
    canSleepAt: string | null
    map: 'farm' | 'woods'
    x: number
    y: number
    mainStep: number
    woodsOpen: boolean
  }
  plots: Plot[]
  inventory: Record<string, number>
  shop: ShopItem[]
  crops: Crop[]
  unlockCost: number
  upgradeCosts: number[]
  words: number
  monsters: Monster[]
  spawns: Spawn[]
}

export interface Monster {
  id: string
  name: Bilingual
  hp: number
  hit: number
  gold: number
  /** The one the story builds up to. */
  boss?: boolean
}

export interface Spawn {
  id: string
  monster: string
  x: number
  y: number
  /** When it is back after being beaten; null while it is here. */
  respawnAt: string | null
}

export type QuestionKind = 'meaning' | 'listen' | 'scramble' | 'ipa'

export interface Question {
  kind: QuestionKind
  /** The word (meaning), the IPA (ipa), or the definition as a hint (scramble). */
  prompt: string
  /** The word to say aloud, for listen. */
  say?: string
  /** Four to choose from; for scramble, the letters, shuffled. */
  options: string[]
}

export interface Battle {
  id: number
  spawn: string
  monster: Monster
  monsterHp: number
  monsterHpMax: number
  hp: number
  hpMax: number
  round: number
  state: 'active' | 'won' | 'lost' | 'fled'
  question: Question
  issuedAt: string
  deadline: string
  now: string
  right: number
  wrong: number
  hitsTaken: number
  /** Which part of the fight this is, from 1, of how many: a boss changes as it tires. */
  phase: number
  phases: number
  gold: number
  drop: string
  fine: number
  words: string[]
}

export interface Turn {
  right: boolean
  late: boolean
  entry: HarvestedWord
  answer: string
  strike: number
  hit: number
}

export interface Reward {
  gold?: number
  stamina?: number
  items?: Record<string, number>
}

export interface MainQuest {
  step: number
  id: string
  chapter: number
  giver: string
  title: Bilingual
  lines: Bilingual[]
  objective: Bilingual
  target: number
  progress: number
  done: boolean
  reward: Reward
}

export interface DailyQuest {
  id: string
  title: Bilingual
  target: number
  progress: number
  done: boolean
  claimed: boolean
  learning: boolean
  reward: Reward
}

export interface Quests {
  main: MainQuest | null
  day: string
  endsAt: string
  daily: DailyQuest[]
  chest: { ready: boolean; claimed: boolean; reward: Reward; streak: number; bonus: Reward }
  claimable: number
}

export interface HarvestedWord {
  word: string
  ipa: string
  meaning: string
}

export const gameApi = {
  state: () => api.get<GameState>('/api/game/state'),
  quests: () => api.get<Quests>('/api/game/quests'),
  plant: (plot: number, seed: string) => api.send<GameState>('POST', '/api/game/plant', { plot, seed }),
  harvest: (plot: number) =>
    api.send<{ state: GameState; word: HarvestedWord | null; gold: number }>('POST', '/api/game/harvest', { plot }),
  unlock: (plot: number) => api.send<GameState>('POST', '/api/game/unlock', { plot }),
  upgrade: (plot: number) => api.send<GameState>('POST', '/api/game/upgrade', { plot }),
  buy: (item: string, qty: number) => api.send<GameState>('POST', '/api/game/buy', { item, qty }),
  use: (item: string) => api.send<GameState>('POST', '/api/game/use', { item }),
  sleep: () => api.send<GameState>('POST', '/api/game/sleep', {}),
  listen: (word: string) => api.send<void>('POST', '/api/game/listen', { word }),
  move: (map: 'farm' | 'woods', x: number, y: number) => api.send<void>('POST', '/api/game/move', { map, x, y }),
  battle: () => api.get<{ battle: Battle | null }>('/api/game/battle'),
  startBattle: (spawn: string) =>
    api.send<{ battle: Battle; state: GameState }>('POST', '/api/game/battle/start', { spawn }),
  answer: (battle: number, answer: string) =>
    api.send<{ turn: Turn; battle: Battle; state: GameState }>('POST', '/api/game/battle/answer', { battle, answer }),
  flee: (battle: number) => api.send<{ battle: Battle; state: GameState }>('POST', '/api/game/battle/flee', { battle }),
  claim: (quest: string) =>
    api.send<{ reward: Reward; state: GameState; quests: Quests }>('POST', '/api/game/quests/claim', { quest }),
}
