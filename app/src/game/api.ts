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
  kind: 'seed' | 'food' | 'gift' | 'tool'
  price: number
  stamina?: number
  hp?: number
  unlockStep: number
  unlocked: boolean
  /** Who sells it: Mira on the farm, or Hugo at the café in town. */
  seller: 'mira' | 'hugo' | ''
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
    map: 'farm' | 'woods' | 'town'
    x: number
    y: number
    mainStep: number
    woodsOpen: boolean
    townOpen: boolean
    /** The Word Hall's door is in the story; Lina takes words. */
    hallOpen: boolean
    libraryOpen: boolean
    /** Chapter 4: the Word Hall's rooms are open, and how many have their
     *  words back. */
    roomsOpen: boolean
    roomsDone: number
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
  /** The people of Echo Town; empty until the town is open. */
  friends: Friend[]
  /** Today's letter in the mailbox, once the townsfolk write. */
  letter: Letter | null
}

/** A letter from someone in town: what they wrote, never the item itself —
 *  reading it is how the player knows what to bring. */
export interface Letter {
  from: { id: string; name: Bilingual; role: Bilingual }
  body: Bilingual[]
  gold: number
  done: boolean
}

/** A question from the Word Hall's door or from Lina. The answer stays on
 *  the server. */
export interface Quiz {
  kind: 'ipa' | 'meaning'
  prompt: string
  options: string[]
}

export interface QuizAnswer {
  right: boolean
  word: string
  ipa: string
  meaning: string
  gold: number
}

export interface Hall {
  /** Sage Orin's glasses are in the bag: the notes can be read. */
  glasses: boolean
  read: number
  perDay: number
  note: Quiz | null
}

export interface Library {
  donated: number
  milestones: { words: number; reward: Reward; reached: boolean; claimed: boolean }[]
  words: { word: string; ipa: string }[]
  available: number
  asked: Quiz | null
  askedWord: string
}

/** One place in a room's bundle. An empty one shows only what its word means. */
export interface RoomPlace {
  vi: string
  key: string
  filled: boolean
  triedToday: boolean
  word?: string
  ipa?: string
}

export interface RoomBundle {
  id: string
  name: Bilingual
  reward: Reward
  words: RoomPlace[]
  full: boolean
  claimed: boolean
}

export interface Room {
  id: string
  name: Bilingual
  lexi: Bilingual
  icon: string
  reward: Reward
  bundles: RoomBundle[]
  restored: boolean
}

/** The Word Hall inside: the rooms open so far, and how many there are. */
export interface Rooms {
  rooms: Room[]
  total: number
}

export interface HeartEvent {
  hearts: number
  lines: Bilingual[]
  reward: Reward
}

export interface Friend {
  id: string
  name: Bilingual
  role: Bilingual
  points: number
  hearts: number
  talkedToday: boolean
  giftedToday: boolean
  /** A heart event reached and not yet opened. */
  event: HeartEvent | null
}

/** Today's chat with someone in town: what they say, three replies, and three
 *  ways of handing them a gift. Which is right stays on the server. */
export interface Chat {
  npc: string
  line: Bilingual
  replies: Bilingual[]
  talked: boolean
  giftWords: Bilingual[]
}

export interface TalkResult {
  right: boolean
  why: Bilingual
  answer: Bilingual
  points: number
  friend: Friend
}

export interface GiftResult {
  taste: 'loved' | 'liked' | 'neutral' | 'disliked'
  rightWords: boolean
  why: Bilingual
  points: number
  friend: Friend
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
  move: (map: 'farm' | 'woods' | 'town', x: number, y: number) =>
    api.send<void>('POST', '/api/game/move', { map, x, y }),
  chat: (npc: string) => api.get<Chat>(`/api/game/talk/${encodeURIComponent(npc)}`),
  talk: (npc: string, reply: number) =>
    api.send<{ result: TalkResult; state: GameState }>('POST', '/api/game/talk', { npc, reply }),
  gift: (npc: string, item: string, words: number) =>
    api.send<{ result: GiftResult; state: GameState }>('POST', '/api/game/gift', { npc, item, words }),
  heart: (npc: string, hearts: number) =>
    api.send<{ event: HeartEvent; state: GameState }>('POST', '/api/game/heart', { npc, hearts }),
  clinic: () => api.send<GameState>('POST', '/api/game/clinic', {}),
  hall: () => api.send<{ hall: Hall; state: GameState }>('POST', '/api/game/hall', {}),
  readNote: (answer: string) =>
    api.send<{ result: QuizAnswer; state: GameState }>('POST', '/api/game/hall/read', { answer }),
  library: (q = '') => api.get<Library>(`/api/game/library${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  askDonation: (word: string) => api.send<Quiz>('POST', '/api/game/library/ask', { word }),
  donate: (answer: string) =>
    api.send<{ result: QuizAnswer; state: GameState }>('POST', '/api/game/library/donate', { answer }),
  claimMilestone: (words: number) =>
    api.send<{ reward: Reward; state: GameState }>('POST', '/api/game/library/claim', { words }),
  rooms: () => api.get<Rooms>('/api/game/rooms'),
  askRoomWord: (place: string) => api.send<Question>('POST', '/api/game/rooms/ask', { place }),
  answerRoomWord: (answer: string) =>
    api.send<{ result: QuizAnswer; state: GameState }>('POST', '/api/game/rooms/answer', { answer }),
  claimBundle: (bundle: string) =>
    api.send<{ reward: Reward; restored: string; state: GameState }>('POST', '/api/game/rooms/claim', { bundle }),
  deliver: (npc: string) =>
    api.send<{ result: { gold: number; points: number; friend: Friend }; state: GameState }>(
      'POST',
      '/api/game/letter/deliver',
      { npc },
    ),
  battle: () => api.get<{ battle: Battle | null }>('/api/game/battle'),
  startBattle: (spawn: string) =>
    api.send<{ battle: Battle; state: GameState }>('POST', '/api/game/battle/start', { spawn }),
  answer: (battle: number, answer: string) =>
    api.send<{ turn: Turn; battle: Battle; state: GameState }>('POST', '/api/game/battle/answer', { battle, answer }),
  flee: (battle: number) => api.send<{ battle: Battle; state: GameState }>('POST', '/api/game/battle/flee', { battle }),
  claim: (quest: string) =>
    api.send<{ reward: Reward; state: GameState; quests: Quests }>('POST', '/api/game/quests/claim', { quest }),
}
