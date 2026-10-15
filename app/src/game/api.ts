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
  kind: 'seed' | 'food'
  price: number
  stamina?: number
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
    canSleepAt: string | null
    map: string
    x: number
    y: number
    mainStep: number
  }
  plots: Plot[]
  inventory: Record<string, number>
  shop: ShopItem[]
  crops: Crop[]
  unlockCost: number
  upgradeCosts: number[]
  words: number
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
  move: (x: number, y: number) => api.send<void>('POST', '/api/game/move', { map: 'farm', x, y }),
  claim: (quest: string) =>
    api.send<{ reward: Reward; state: GameState; quests: Quests }>('POST', '/api/game/quests/claim', { quest }),
}
