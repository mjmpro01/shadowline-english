import { api, ApiError } from '../lib/api'
import type {
  Banner,
  Dub,
  Episode,
  Gloss,
  Playlist,
  PlaylistList,
  SectionPage,
  SectionRow,
  Profile,
  SearchResults,
  Take,
  Video,
  VocabStatus,
  VocabWord,
} from '../data/types'

/**
 * The app's data seam. Records live on the server now; this is the only module
 * that knows the shape of the API, and screens talk to the store rather than to
 * either.
 *
 * Writes are per record rather than per collection. The localStorage version
 * saved whole arrays — `saveVideos(videos[])` — which was fine for one browser
 * and would have had two devices overwriting each other's work.
 */
export interface Repository {
  me(): Promise<Profile | null>
  logout(): Promise<void>

  /** The library's top level, a page at a time: series with their counts and
   *  badges, and how many series there are in all. */
  playlistPage(offset: number, limit: number): Promise<PlaylistList>
  /** The shelves that have series on them, each with the start of its row. */
  sections(): Promise<SectionRow[]>
  /** One shelf, a page at a time. */
  section(slug: string, offset: number, limit: number): Promise<SectionPage>
  /** One series and its episodes, together: there is no moment worth rendering
   *  where the screen has the heading and not the list. */
  playlist(slug: string): Promise<PlaylistPage>
  /** One episode, its clips, and the series it is in — the last so the screen
   *  can offer the way back up by name without a second round trip. */
  episode(id: string): Promise<EpisodePage>
  /** One search across all three levels. */
  searchLibrary(query: string): Promise<SearchResults>

  /** The clips a screen already knows it wants. There is no endpoint for the
   *  whole library any more: it was 7.4MB at sign-in, most of it signed poster
   *  URLs for clips nobody was going to open. */
  clipsByIds(ids: string[]): Promise<Video[]>
  /** One clip, or null when it is not there any more. */
  clip(id: string): Promise<Video | null>
  /** Everything the server keeps about this learner, as a JSON file. */
  exportAccount(): Promise<Blob>
  /** Sets a new password; the current one has to be right. */
  changePassword(current: string, next: string): Promise<void>
  /** Deletes this account and everything in it, confirmed by its address. */
  deleteAccount(email: string): Promise<void>
  /** The announcements showing now on one screen, for this app language. */
  banners(placement: 'dashboard' | 'library', locale: string): Promise<Banner[]>
  /** What the dashboard offers; an admin picks these. */
  featuredClips(): Promise<Video[]>
  /** The server's public key for push, or null when reminders are off there. */
  pushKey(): Promise<string | null>
  subscribePush(sub: PushSubscriptionBody): Promise<void>
  unsubscribePush(endpoint: string): Promise<void>
  reminders(): Promise<Reminders>
  saveReminders(prefs: Omit<Reminders, 'subscribed' | 'promptDismissed'>): Promise<Reminders>
  /** Sends a reminder now; answers how many of the learner's browsers took it. */
  testReminder(): Promise<number>
  dismissReminderPrompt(): Promise<void>
  /** Where the learner left off, or null. */
  continueWatching(): Promise<Continue | null>
  /** Episodes new to the learner, followed series first. */
  newEpisodes(): Promise<NewEpisodes>
  /** Records that the learner opened an episode: no longer new to them. */
  markSeen(episodeId: string): Promise<void>
  follow(slug: string): Promise<void>
  unfollow(slug: string): Promise<void>
  /** Today: points toward the goal, the streak, and what is left to do. */
  today(): Promise<Today>
  /** Chooses the daily goal, in points, and answers with today after it. */
  setGoal(points: DailyGoal): Promise<Today>
  /** What to practise next — a clip never tried, or the one that went worst.
   *  A question about the whole library, so the server answers it. */
  nextUp(): Promise<Video | null>
  /** The counts and the tags the app used to work out by counting a library
   *  it had been sent. */
  librarySummary(): Promise<LibrarySummary>
  clipAudioURL(clipId: string): Promise<string | null>
  /** Null until the cutter has produced one, and for ever on an audio clip. */
  clipVideoURL(clipId: string): Promise<string | null>

  listTakes(): Promise<Take[]>
  createTake(clipId: string, audio: Blob): Promise<Take>
  getTake(takeId: string): Promise<Take>
  /** Throws away a recording and its audio. */
  deleteTake(takeId: string): Promise<void>
  takeAudioURL(takeId: string): Promise<string | null>
  /** Asks for the take to be muxed onto its clip, and reads how that is going. */
  requestDub(takeId: string): Promise<Dub>
  dub(takeId: string): Promise<Dub>

  /** Asks for a word to be looked up, and answers with the gloss if somebody
   *  already has. The line it was tapped in decides which sense gets written
   *  down, the first time anybody taps it. */
  lookUpWord(word: string, context: string): Promise<Gloss>
  /** Reads a lookup already asked for, for the wait after a `pending`. */
  wordGloss(word: string): Promise<Gloss>

  listVocab(): Promise<VocabWord[]>
  createVocabWord(word: NewVocabWord): Promise<VocabWord>
  updateVocabWord(id: string, patch: VocabPatch): Promise<VocabWord>
  deleteVocabWord(id: string): Promise<void>

  updateProfile(name: string): Promise<Profile>
  setNativeLanguage(language: string): Promise<Profile>
  uploadAvatar(avatar: Blob): Promise<Profile>

  leaderboard(): Promise<LeaderboardRow[]>
  /** This week's board; a week just ended has its medals given out first. */
  weeklyLeaderboard(): Promise<WeeklyBoard>
  /** The learner's weekly medals. */
  medals(): Promise<LearnerMedals>
  /** Where the learner stands on every achievement track. */
  achievements(): Promise<AchievementBoard>
  /** Achievements unlocked and not yet celebrated, oldest first. */
  newAchievements(): Promise<UnlockedAchievement[]>
  /** Records that these have been celebrated. */
  markAchievementsSeen(ids: string[]): Promise<void>

  /** The learner's coins, today's, and where the latest came from. */
  wallet(): Promise<Wallet>
  /** The learner's fighter, the characters they own, and the roster. */
  arena(): Promise<ArenaState>
  /** Makes the fighter, as one of the free characters. */
  createFighter(name: string, character: string): Promise<ArenaState>
  renameFighter(name: string): Promise<ArenaState>
  /** Buys a character with coins; it is kept. */
  buyCharacter(id: string): Promise<ArenaState>
  /** Plays a character already owned. */
  selectCharacter(id: string): Promise<ArenaState>
  /** The tower's floors, the fighter's energy and level, and a duel under way. */
  tower(): Promise<Tower>
  /** The duel under way, or null. */
  duel(): Promise<Duel | null>
  startDuel(floor: number): Promise<Duel>
  answerDuel(duel: Duel, answer: string, special: boolean): Promise<{ turn: DuelTurn; duel: Duel }>
  fleeDuel(): Promise<void>
  /** Three rivals to fight: learners rated nearest, or sparring bots. */
  rivals(): Promise<Rival[]>
  startPvP(rival: string): Promise<Duel>
  /** This week's Arena board; a week just ended has its top three paid first. */
  arenaBoard(): Promise<ArenaBoard>

  /** A passage to write down, starting at one line of an episode: the lines
   *  after it to make half a minute to a minute and a half, cut into phrases. */
  dictation(clipId: string): Promise<Passage>
  /** Keeps how a dictation went; it comes back to be listened to tomorrow. */
  saveDictation(dictation: NewDictation): Promise<Dictation>
  /** The dictations due to be listened to again today, and the latest. */
  dictations(): Promise<DictationList>
  reviewDictation(id: string): Promise<void>

  /** The dialogues to learn, with how many lines of each this learner knows. */
  dialogues(): Promise<DialogueSummary[]>
  /** One dialogue, by id or slug, with this learner's readings of each line. */
  dialogue(ref: string): Promise<LearnerDialogue>
  /** Counts one reading aloud of a line: heard of total words, when the
   *  browser could listen; nothing heard of nothing when it could not. */
  readLine(dialogueId: string, line: number, heard: number, total: number): Promise<LinePasses>
  phrasebook(): Promise<PhrasebookEntry[]>
  addPhrase(phrase: PhraseInput): Promise<PhrasebookEntry>
  updatePhrase(id: string, phrase: PhraseInput): Promise<PhrasebookEntry>
  deletePhrase(id: string): Promise<void>

  /** The learner's role-plays with the tutor, the latest first. */
  roleplays(): Promise<Roleplay[]>
  roleplay(id: string): Promise<RoleplaySession>
  /** Opens a role-play, with the tutor's first line in its part. */
  startRoleplay(start: RoleplayStart): Promise<RoleplaySession>
  /** What the learner said, back said better when it could be, and the
   *  tutor's next line. */
  roleplayTurn(id: string, text: string): Promise<RoleplayReply>
  /** Ends a role-play with feedback on the whole of it. */
  endRoleplay(id: string): Promise<RoleplayFeedback>
  deleteRoleplay(id: string): Promise<void>
}

export type RoleplayScenario = 'interview' | 'presentation' | 'dialogue'

export interface RoleplayStart {
  scenario: RoleplayScenario
  /** The job, or what the talk is about. */
  topic?: string
  /** For a dialogue: its id or slug, and the side the learner plays. */
  dialogueId?: string
  side?: 'A' | 'B'
}

export interface Roleplay {
  id: string
  scenario: RoleplayScenario
  dialogueId: string | null
  title: string
  topic: string
  ownSide: '' | 'A' | 'B'
  createdAt: string
  updatedAt: string
  endedAt: string | null
}

export interface RoleplayTurn {
  role: 'user' | 'assistant'
  content: string
  /** On the learner's turns: how it would sound more natural, and why. */
  better: string
  why: string
}

export interface RoleplayReply {
  better: string
  why: string
  reply: string
}

export interface RoleplayFeedback {
  summary: string
  strengths: string[]
  fixes: { said: string; better: string; why: string }[]
  phrases: DialoguePhrase[]
}

export interface RoleplaySession extends Roleplay {
  turns: RoleplayTurn[]
  feedback: RoleplayFeedback | null
}

export interface DialogueLine {
  speaker: 'A' | 'B'
  /** Who they are in the scene: "Barista", "You". */
  name: string
  text: string
  /** What it means in Vietnamese. */
  vi: string
}

export interface DialoguePhrase {
  phrase: string
  note: string
}

export type DialogueLevel = 'A1' | 'A2' | 'B1' | 'B2'

export interface DialogueSummary {
  id: string
  slug: string
  title: string
  /** In Vietnamese: where this is and who is talking. */
  situation: string
  topic: string
  level: DialogueLevel
  lines: number
  /** Lines read aloud the goal's number of times. */
  known: number
}

export interface LinePasses {
  passes: number
  /** The most of the line the browser ever heard, 0 to 1. */
  best: number
}

export interface LearnerDialogue {
  id: string
  slug: string
  title: string
  situation: string
  topic: string
  level: DialogueLevel
  lines: DialogueLine[]
  phrases: DialoguePhrase[]
  /** One per line, in order. */
  passes: LinePasses[]
  /** How many readings make a line known. */
  goal: number
}

export interface PhraseInput {
  dialogueId?: string | null
  situation: string
  phrase: string
  note: string
}

export interface PhrasebookEntry {
  id: string
  /** Null when written by hand, or once the dialogue is gone. */
  dialogueId: string | null
  situation: string
  phrase: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface Passage {
  episode: { id: string; title: string }
  clips: { id: string; title: string; durationSeconds: number; text: string }[]
  /** Seconds from the start of their clip's own sound. */
  chunks: { clipId: string; start: number; end: number; text: string }[]
  totalSeconds: number
}

export interface DictationErrors {
  missingEnding: number
  shortWord: number
  unknownWord: number
  sound: number
  linking: number
  other: number
}

export interface NewDictation {
  firstClipId: string
  clipIds: string[]
  total: number
  right: number
  errors: DictationErrors
}

export interface Dictation {
  id: string
  episodeId: string
  episodeTitle: string
  /** Null once the line it started at has been deleted. */
  firstClipId: string | null
  firstLine: string
  /** Where in the episode it starts, from 1; what is shown in place of the
   *  line, which would give the passage away. 0 once that line is deleted. */
  firstLineNumber: number
  total: number
  right: number
  errors: DictationErrors
  createdAt: string
  reviewOn: string
  reviewedAt: string | null
}

/** Daily goals a learner can choose, in points: a take is 2, a flashcard 1, a
 *  dictation 5, listening to one again 3, a dialogue line 1, a tutor turn 2. */
export const DAILY_GOALS = [10, 20, 40] as const
export type DailyGoal = (typeof DAILY_GOALS)[number]

export interface Today {
  day: string
  goal: number
  goalChosen: boolean
  points: number
  reached: boolean
  /** The coins reaching the goal adds to the wallet. */
  goalCoins: number
  streak: {
    count: number
    best: number
    freezes: number
    /** Today already has learning in it. */
    today: boolean
    /** Alive, but it ends tonight unless something is learned today. */
    atRisk: boolean
  }
  nextClip: Video | null
  vocabDue: number
  dictationsDue: number
  firstDictation: Dictation | null
  /** Reminders on, with a browser to send to. */
  remindersOn: boolean
  /** The learner said "later" to being asked to turn reminders on. */
  reminderPromptDismissed: boolean
}

/** What the learner wants to be reminded of, and when. */
export interface Reminders {
  enabled: boolean
  /** "HH:MM" in `tz`. */
  remindAt: string
  tz: string
  locale: 'vi' | 'en'
  streak: boolean
  newEpisodes: boolean
  /** The weekly race: a medal won, achievements unseen, a close Sunday. */
  competition: boolean
  promptDismissed: boolean
  /** A browser of theirs is subscribed. */
  subscribed: boolean
}

export interface PushSubscriptionBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface DictationList {
  due: Dictation[]
  recent: Dictation[]
}

export interface LibrarySummary {
  clips: number
  series: number
  categories: string[]
}

export interface PlaylistPage {
  playlist: Playlist
  episodes: Episode[]
  /** Whether the learner follows this series: by practising in it, or by
   *  pressing Follow. */
  following: boolean
}

/** Where the learner left off: an episode they were practising, how far
 *  through it they are, and the next clip in it. */
export interface Continue {
  episode: Episode
  playlist: Playlist | null
  total: number
  practised: number
  next: Video
}

/** An episode new to the learner, with the series it is in. */
export interface NewEpisode extends Episode {
  playlistSlug: string
  playlistTitle: string
  followed: boolean
  publishedAt: string
  /** Published after the last day the learner came. */
  sinceLastVisit: boolean
  /** The episode a series' loose clips hang in: its title means nothing. */
  standalone: boolean
}

export interface NewEpisodes {
  episodes: NewEpisode[]
  /** How many episodes are new in each series, by its id. */
  series: Record<string, number>
}

export interface EpisodePage {
  episode: Episode
  /** Null for an episode an admin has moved out of every series; the screen
   *  drops the breadcrumb rather than inventing one. */
  playlist: Playlist | null
  clips: Video[]
}

export interface NewVocabWord {
  word: string
  ipa: string
  meaning: string
  videoId: string | null
}

export interface VocabPatch {
  status?: VocabStatus
  /** Records that the card came up in memory practice. */
  reviewed?: boolean
}

export interface WeeklyMedals {
  gold: number
  silver: number
  bronze: number
}

/** This week's board, by practice points, Monday to Sunday on Vietnam's clock. */
export interface WeeklyBoard {
  week: string
  endsAt: string
  /** Days until it ends, today counted: 1 on a Sunday. */
  daysLeft: number
  rows: { rank: number; userId: string; name: string; points: number; isYou: boolean; medals: WeeklyMedals }[]
  /** The learner, when they are on the board below the rows shown. */
  you: { rank: number; points: number } | null
  /** Last week's podium. */
  lastWeek: { place: number; name: string; points: number; isYou: boolean }[]
}

export interface LearnerMedals extends WeeklyMedals {
  recent: { week: string; place: number }[]
}

export interface Wallet {
  coins: number
  /** Coins earned today. */
  today: number
  recent: { kind: string; item: string; amount: number; at: string }[]
}

export type Tier = 'common' | 'rare' | 'epic' | 'legendary'
export type SkillKind = 'crit' | 'combo' | 'drain' | 'heal' | 'stun' | 'focus'

export interface FighterStats {
  atk: number
  def: number
  hp: number
  /** Seconds added to the time to answer. */
  time: number
  /** Extra rage for each right answer. */
  rage: number
}

/** What a fighter is drawn from: one of the Arena's characters. */
export interface CharacterLook {
  id: string
  female: boolean
  /** The stand-in's two colours, until the character's art arrives. */
  palette: [string, string]
  weapon: { name: { en: string; vi: string }; kind: string }
}

/** One of the characters a learner can play. */
export interface Character extends CharacterLook {
  name: { en: string; vi: string }
  tier: Tier
  /** In coins; 0 for the two a fighter can start as. */
  price: number
  skill: { kind: SkillKind; name: { en: string; vi: string } }
}

export interface Fighter {
  name: string
  /** The character played now. */
  character: string
  level: number
  xp: number
}

export interface ArenaState {
  coins: number
  /** What the learner earns a day lately, to say how far a character is. */
  coinsPerDay: number
  fighter: Fighter | null
  stats: FighterStats
  owned: string[]
  /** Every character, with what it adds to the fighter's stats. */
  roster: (Character & { owned: boolean; bonus: FighterStats })[]
}

/** One floor's fighter: one of the characters a learner can play. */
export interface Opponent {
  floor: number
  id: string
  name: { en: string; vi: string }
  boss: boolean
  character: Character
  /** Drawn as the learner's own character. */
  mirror?: boolean
  atk: number
  def: number
  hp: number
  coins: number
  xp: number
  /** A shadow's level and rating; a sparring bot is one from the tower. */
  level?: number
  rating?: number
  bot?: boolean
}

export interface Rival {
  id: string
  name: string
  character: Character
  level: number
  rating: number
  bot: boolean
}

export interface ArenaBoard {
  week: string
  daysLeft: number
  rows: { rank: number; userId: string; name: string; character: string; points: number; wins: number; rating: number; isYou: boolean }[]
  you: { rank: number; points: number; wins: number; rating: number } | null
  lastWeek: { place: number; name: string; points: number; isYou: boolean }[]
  prizes: number[]
}

export interface Tower {
  floors: (Opponent & { locked: boolean; cleared: boolean })[]
  energy: number
  energyMax: number
  /** When the next unit of energy comes back; null when full. */
  nextEnergy: string | null
  /** Minutes until then, rounded up; 0 when full. */
  nextEnergyIn: number
  level: number
  xp: number
  xpNext: number
  activeDuel: number | null
  rating: number
  pvpWins: number
  pvpLosses: number
}

export type QuestionKind = 'meaning' | 'listen' | 'scramble' | 'ipa' | 'cloze'

export interface DuelQuestion {
  kind: QuestionKind
  prompt: string
  say?: string
  hint?: string
  options: string[]
}

export interface Duel {
  id: number
  floor: number
  opponent: Opponent
  state: 'active' | 'won' | 'lost' | 'fled'
  hp: number
  hpMax: number
  oppHp: number
  oppMax: number
  rage: number
  combo: number
  turn: number
  question: DuelQuestion | null
  /** This turn is the opponent's big attack: answer to block it. */
  block: boolean
  seconds: number
  deadline: string
  right: number
  wrong: number
  coins: number
  xp: number
  /** A boss's first-clear bonus, paid besides `coins`. */
  bonus: number
  levelUp: boolean
  firstClear: boolean
  words: string[]
  kind: 'tower' | 'pvp'
  /** What a duel against a shadow did to the learner's rating. */
  ratingDelta: number
  /** The learner's skill this duel; hits a stun still shrugs off; questions
   *  after this one a focus skill still lengthens. */
  skill: SkillKind | ''
  shield: number
  focus: number
}

export type DuelMove = 'light' | 'heavy' | 'special' | 'block' | 'hit'

export interface DuelTurn {
  move: DuelMove
  dealt: number
  taken: number
  rage: number
  combo: number
  right: boolean
  late: boolean
  answer: string
  entry: { word: string; ipa: string; meaning: string }
  /** What a skill did besides the hit. */
  skill?: SkillKind
  healed?: number
  shield: number
  /** A hit taken for nothing: the opponent was stunned. */
  shielded?: boolean
  focus?: number
  /** A right answer the opponent still hit back: it came late. */
  countered?: boolean
  /** The share of the time left when the answer came, 0–100. */
  speed: number
}

/** A milestone reached: "takes.50" is the takes track's target of 50. */
export interface UnlockedAchievement {
  id: string
  track: string
  target: number
  /** Arena gold it paid: 0 for a learner who does not play. */
  gold: number
}

export interface AchievementTier {
  id: string
  target: number
  gold: number
  unlockedAt: string | null
}

/** One ladder of milestones and how far up it the learner is. */
export interface AchievementTrack {
  track: string
  count: number
  tiers: AchievementTier[]
}

export interface AchievementBoard {
  tracks: AchievementTrack[]
  unlocked: number
  total: number
}

export interface LeaderboardRow {
  userId: string
  name: string
  avg: number
  takes: number
  clips: number
  isYou: boolean
}

/** The server answers `{ url }` for audio, with null for a clip that has none. */
interface SignedURL {
  url: string | null
}

class ApiRepository implements Repository {
  async me() {
    const { user } = await api.get<{ user: Profile | null }>('/auth/me')
    return user
  }

  logout() {
    return api.send<void>('POST', '/auth/logout', {})
  }

  playlistPage(offset: number, limit: number) {
    return api.get<PlaylistList>(`/api/playlists?offset=${offset}&limit=${limit}`)
  }

  sections() {
    return api.get<SectionRow[]>('/api/library/sections')
  }

  section(slug: string, offset: number, limit: number) {
    return api.get<SectionPage>(
      `/api/library/sections/${encodeURIComponent(slug)}?offset=${offset}&limit=${limit}`,
    )
  }

  playlist(slug: string) {
    return api.get<PlaylistPage>(`/api/playlists/${encodeURIComponent(slug)}`)
  }

  episode(id: string) {
    return api.get<EpisodePage>(`/api/episodes/${id}`)
  }

  searchLibrary(query: string) {
    return api.get<SearchResults>(`/api/library/search?q=${encodeURIComponent(query)}`)
  }

  clipsByIds(ids: string[]) {
    if (ids.length === 0) return Promise.resolve([])
    return api.get<Video[]>(`/api/clips?ids=${ids.join(',')}`)
  }

  async clip(id: string) {
    try {
      return await api.get<Video>(`/api/clips/${id}`)
    } catch (err) {
      // Gone is an answer, not a failure: a clip an admin deleted while
      // somebody had it open.
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  }

  featuredClips() {
    return api.get<Video[]>('/api/clips/featured')
  }

  today() {
    return api.get<Today>('/api/today')
  }

  async pushKey() {
    try {
      const { publicKey } = await api.get<{ publicKey: string }>('/api/push/key')
      return publicKey
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null
      throw err
    }
  }

  subscribePush(sub: PushSubscriptionBody) {
    return api.send<void>('POST', '/api/push/subscribe', sub)
  }

  unsubscribePush(endpoint: string) {
    return api.send<void>('DELETE', '/api/push/subscribe', { endpoint })
  }

  reminders() {
    return api.get<Reminders>('/api/reminders')
  }

  saveReminders(prefs: Omit<Reminders, 'subscribed' | 'promptDismissed'>) {
    return api.send<Reminders>('PUT', '/api/reminders', prefs)
  }

  async testReminder() {
    const { delivered } = await api.send<{ delivered: number }>('POST', '/api/push/test', {})
    return delivered
  }

  dismissReminderPrompt() {
    return api.send<void>('POST', '/api/reminders/prompt-dismissed', {})
  }

  async continueWatching() {
    const { continue: cont } = await api.get<{ continue: Continue | null }>('/api/continue')
    return cont
  }

  newEpisodes() {
    return api.get<NewEpisodes>('/api/new')
  }

  markSeen(episodeId: string) {
    return api.send<void>('POST', `/api/episodes/${episodeId}/seen`, {})
  }

  follow(slug: string) {
    return api.send<void>('PUT', `/api/playlists/${encodeURIComponent(slug)}/follow`, {})
  }

  unfollow(slug: string) {
    return api.send<void>('DELETE', `/api/playlists/${encodeURIComponent(slug)}/follow`, {})
  }

  setGoal(points: DailyGoal) {
    return api.send<Today>('PUT', '/api/goal', { dailyPoints: points })
  }

  exportAccount() {
    return api.file('/api/account/export')
  }

  changePassword(current: string, next: string) {
    return api.send<void>('POST', '/api/account/password', { current, next })
  }

  deleteAccount(email: string) {
    return api.send<void>('DELETE', '/api/account', { email })
  }

  banners(placement: 'dashboard' | 'library', locale: string) {
    const params = new URLSearchParams({ placement, locale })
    return api.get<Banner[]>(`/api/banners?${params.toString()}`)
  }

  async nextUp() {
    const { clip } = await api.get<{ clip: Video | null }>('/api/clips/next-up')
    return clip
  }

  librarySummary() {
    return api.get<LibrarySummary>('/api/library/summary')
  }

  async clipAudioURL(clipId: string) {
    const { url } = await api.get<SignedURL>(`/api/clips/${clipId}/audio`)
    return url
  }

  async clipVideoURL(clipId: string) {
    const { url } = await api.get<SignedURL>(`/api/clips/${clipId}/video`)
    return url
  }

  listTakes() {
    return api.get<Take[]>('/api/takes')
  }

  createTake(clipId: string, audio: Blob) {
    return api.upload<Take>('POST', `/api/takes?clipId=${encodeURIComponent(clipId)}`, audio)
  }

  getTake(takeId: string) {
    return api.get<Take>(`/api/takes/${takeId}`)
  }

  deleteTake(takeId: string) {
    return api.del(`/api/takes/${takeId}`)
  }

  async takeAudioURL(takeId: string) {
    const { url } = await api.get<SignedURL>(`/api/takes/${takeId}/audio`)
    return url
  }


  requestDub(takeId: string) {
    return api.send<Dub>('POST', `/api/takes/${takeId}/dub`, {})
  }

  dub(takeId: string) {
    return api.get<Dub>(`/api/takes/${takeId}/dub`)
  }

  lookUpWord(word: string, context: string) {
    return api.send<Gloss>('POST', `/api/words/${encodeURIComponent(word)}`, { context })
  }

  wordGloss(word: string) {
    return api.get<Gloss>(`/api/words/${encodeURIComponent(word)}`)
  }

  listVocab() {
    return api.get<VocabWord[]>('/api/vocab')
  }

  createVocabWord(word: NewVocabWord) {
    return api.send<VocabWord>('POST', '/api/vocab', word)
  }

  updateVocabWord(id: string, patch: VocabPatch) {
    return api.send<VocabWord>('PATCH', `/api/vocab/${id}`, patch)
  }

  deleteVocabWord(id: string) {
    return api.del(`/api/vocab/${id}`)
  }

  updateProfile(name: string) {
    return api.send<Profile>('PATCH', '/api/profile', { name })
  }

  setNativeLanguage(language: string) {
    return api.send<Profile>('PATCH', '/api/profile', { nativeLanguage: language })
  }

  uploadAvatar(avatar: Blob) {
    return api.upload<Profile>('PUT', '/api/profile/avatar', avatar)
  }

  leaderboard() {
    return api.get<LeaderboardRow[]>('/api/leaderboard')
  }

  weeklyLeaderboard() {
    return api.get<WeeklyBoard>('/api/leaderboard/week')
  }

  medals() {
    return api.get<LearnerMedals>('/api/medals')
  }

  achievements() {
    return api.get<AchievementBoard>('/api/achievements')
  }

  newAchievements() {
    return api.get<UnlockedAchievement[]>('/api/achievements/new')
  }

  markAchievementsSeen(ids: string[]) {
    return api.send<void>('POST', '/api/achievements/seen', { ids })
  }

  wallet() {
    return api.get<Wallet>('/api/wallet')
  }

  arena() {
    return api.get<ArenaState>('/api/arena')
  }

  createFighter(name: string, character: string) {
    return api.send<ArenaState>('POST', '/api/arena/fighter', { name, character })
  }

  renameFighter(name: string) {
    return api.send<ArenaState>('PUT', '/api/arena/fighter', { name })
  }

  buyCharacter(id: string) {
    return api.send<ArenaState>('POST', '/api/arena/characters/buy', { character: id })
  }

  selectCharacter(id: string) {
    return api.send<ArenaState>('POST', '/api/arena/characters/select', { character: id })
  }

  tower() {
    return api.get<Tower>('/api/arena/tower')
  }

  async duel() {
    const { duel } = await api.get<{ duel: Duel | null }>('/api/arena/duel')
    return duel
  }

  async startDuel(floor: number) {
    const { duel } = await api.send<{ duel: Duel }>('POST', '/api/arena/duel/start', { floor })
    return duel
  }

  answerDuel(duel: Duel, answer: string, special: boolean) {
    return api.send<{ turn: DuelTurn; duel: Duel }>('POST', '/api/arena/duel/answer', {
      id: duel.id,
      turn: duel.turn,
      answer,
      special,
    })
  }

  fleeDuel() {
    return api.send<void>('POST', '/api/arena/duel/flee', {})
  }

  rivals() {
    return api.get<Rival[]>('/api/arena/rivals')
  }

  async startPvP(rival: string) {
    const { duel } = await api.send<{ duel: Duel }>('POST', '/api/arena/pvp/start', { rival })
    return duel
  }

  arenaBoard() {
    return api.get<ArenaBoard>('/api/arena/board')
  }

  dictation(clipId: string) {
    return api.get<Passage>(`/api/dictation/${clipId}`)
  }

  saveDictation(dictation: NewDictation) {
    return api.send<Dictation>('POST', '/api/dictations', dictation)
  }

  dictations() {
    return api.get<DictationList>('/api/dictations')
  }

  reviewDictation(id: string) {
    return api.send<void>('POST', `/api/dictations/${id}/review`, {})
  }

  dialogues() {
    return api.get<DialogueSummary[]>('/api/dialogues')
  }

  dialogue(ref: string) {
    return api.get<LearnerDialogue>(`/api/dialogues/${encodeURIComponent(ref)}`)
  }

  readLine(dialogueId: string, line: number, heard: number, total: number) {
    return api.send<LinePasses>('POST', `/api/dialogues/${dialogueId}/pass`, { line, heard, total })
  }

  phrasebook() {
    return api.get<PhrasebookEntry[]>('/api/phrasebook')
  }

  addPhrase(phrase: PhraseInput) {
    return api.send<PhrasebookEntry>('POST', '/api/phrasebook', phrase)
  }

  updatePhrase(id: string, phrase: PhraseInput) {
    return api.send<PhrasebookEntry>('PATCH', `/api/phrasebook/${id}`, phrase)
  }

  deletePhrase(id: string) {
    return api.del(`/api/phrasebook/${id}`)
  }

  roleplays() {
    return api.get<Roleplay[]>('/api/roleplays')
  }

  roleplay(id: string) {
    return api.get<RoleplaySession>(`/api/roleplays/${id}`)
  }

  startRoleplay(start: RoleplayStart) {
    return api.send<RoleplaySession>('POST', '/api/roleplays', start)
  }

  roleplayTurn(id: string, text: string) {
    return api.send<RoleplayReply>('POST', `/api/roleplays/${id}/turns`, { text })
  }

  endRoleplay(id: string) {
    return api.send<RoleplayFeedback>('POST', `/api/roleplays/${id}/end`, {})
  }

  deleteRoleplay(id: string) {
    return api.del(`/api/roleplays/${id}`)
  }
}

export const repository: Repository = new ApiRepository()
