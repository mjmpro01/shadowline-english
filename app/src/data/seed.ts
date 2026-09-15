import type { CaptionLine, MetricScores, NeedPracticeItem, Video, VocabWord } from './types'

/** Caption pool ported from the prototype's CAPTIONS / IPA_CAPTIONS arrays. */
const LINES: Record<string, CaptionLine> = {
  reaction: {
    text: "I honestly wasn't expecting that reaction.",
    ipa: '/aɪ ˈɒnɪstli ˈwɒznt ɪkˈspektɪŋ ðæt riˈækʃən/',
  },
  showingUp: {
    text: "It's not about winning, it's about showing up.",
    ipa: '/ɪts nɒt əˈbaʊt ˈwɪnɪŋ ɪts əˈbaʊt ˈʃəʊɪŋ ʌp/',
  },
  brilliant: {
    text: "Actually, I think it's brilliant.",
    ipa: '/ˈæktʃuəli aɪ θɪŋk ɪts ˈbrɪljənt/',
  },
  consistency: {
    text: "You know, at the end of the day, it's about consistency.",
    ipa: '/juː nəʊ ət ði end əv ðə deɪ ɪts əˈbaʊt kənˈsɪstənsi/',
  },
  energy: {
    text: "That's exactly the kind of energy we need.",
    ipa: '/ðæts ɪɡˈzæktli ðə kaɪnd əv ˈenədʒi wiː niːd/',
  },
  minute: {
    text: "I'm almost finished, just give me a minute.",
    ipa: '/aɪm ˈɔːlməʊst ˈfɪnɪʃt dʒʌst ɡɪv miː ə ˈmɪnɪt/',
  },
  little: {
    text: 'We should talk about this a little more.',
    ipa: '/wiː ʃʊd tɔːk əˈbaʊt ðɪs ə ˈlɪtl mɔː/',
  },
  question: {
    text: "That's a really good question, honestly.",
    ipa: '/ðæts ə ˈrɪəli ɡʊd ˈkwestʃən ˈɒnɪstli/',
  },
  worth: {
    text: 'It took a while, but it was worth it.',
    ipa: '/ɪt tʊk ə waɪl bʌt ɪt wəz wɜːθ ɪt/',
  },
  step: {
    text: "Let's just take it one step at a time.",
    ipa: '/lets dʒʌst teɪk ɪt wʌn step ət ə taɪm/',
  },
  myself: {
    text: "I couldn't have said it better myself.",
    ipa: '/aɪ ˈkʊdnt həv sed ɪt ˈbetə maɪˈself/',
  },
}

export interface SeedVideo extends Video {
  /** Per-take scores of the seeded practice history, oldest first. */
  history: number[]
  metrics: MetricScores
}

export const SEED_VIDEOS: SeedVideo[] = [
  {
    id: 'v1',
    title: "Actually, I think it's brilliant",
    source: 'Jimmy Fallon Interview',
    timestamp: '00:12–00:42',
    duration: '0:42',
    summary:
      'Your pitch rises correctly on the question, but stress lands one syllable early on "brilliant" — compare with take 4.',
    captions: [LINES.brilliant, LINES.question, LINES.myself],
    history: [61, 68, 74, 79, 76, 82],
    metrics: { Intonation: 84, Rhythm: 79, Stress: 88, Variation: 71 },
  },
  {
    id: 'v2',
    title: "That's exactly the kind of energy we need",
    source: 'TED Shorts',
    timestamp: '00:03–00:35',
    duration: '0:35',
    summary:
      'Rhythm drags on "exactly" — the stressed syllable should land about 100ms earlier to match the source.',
    captions: [LINES.energy, LINES.step, LINES.little],
    history: [50, 55, 58],
    metrics: { Intonation: 61, Rhythm: 54, Stress: 66, Variation: 49 },
  },
  {
    id: 'v3',
    title: "I honestly didn't expect that to happen",
    source: 'BBC Interview',
    timestamp: '00:18–00:51',
    duration: '0:51',
    summary: 'Pitch stays flat where the source falls sharply on "happen" — try exaggerating the drop.',
    captions: [LINES.reaction, LINES.worth],
    history: [35, 39],
    metrics: { Intonation: 44, Rhythm: 38, Stress: 41, Variation: 33 },
  },
  {
    id: 'v4',
    title: "You know, at the end of the day, it's about consistency",
    source: 'Joe Rogan Podcast',
    timestamp: '00:55–01:59',
    duration: '1:04',
    summary: 'Excellent match across the whole line — variation on "consistency" is now within tolerance.',
    captions: [LINES.consistency, LINES.step, LINES.worth, LINES.little],
    history: [70, 76, 81, 85, 88, 86, 90, 89, 91],
    metrics: { Intonation: 92, Rhythm: 90, Stress: 93, Variation: 87 },
  },
  {
    id: 'v5',
    title: "It's not about winning, it's about showing up",
    source: 'Ted Lasso Shorts',
    timestamp: '00:08–00:36',
    duration: '0:28',
    summary: 'Good improvement on stress placement — variation on "showing up" still reads a bit monotone.',
    captions: [LINES.showingUp, LINES.minute, LINES.myself],
    history: [52, 60, 63, 67],
    metrics: { Intonation: 70, Rhythm: 64, Stress: 72, Variation: 61 },
  },
]

export const SEED_VOCAB: VocabWord[] = [
  {
    id: 'w1',
    word: 'brilliant',
    ipa: '/ˈbrɪl.jənt/',
    meaning: 'extremely impressive, talented, or intelligent',
    status: 'known',
    videoId: 'v1',
  },
  {
    id: 'w2',
    word: 'honestly',
    ipa: '/ˈɒn.ɪst.li/',
    meaning: 'used to emphasize that you are being sincere',
    status: 'learning',
    videoId: 'v3',
  },
  {
    id: 'w3',
    word: 'exactly',
    ipa: '/ɪɡˈzækt.li/',
    meaning: 'used to emphasize precise agreement',
    status: 'new',
    videoId: 'v2',
  },
  {
    id: 'w4',
    word: 'energy',
    ipa: '/ˈen.ə.dʒi/',
    meaning: 'enthusiasm, liveliness, and drive',
    status: 'learning',
    videoId: 'v2',
  },
  {
    id: 'w5',
    word: 'showing up',
    ipa: '/ˈʃəʊ.ɪŋ ʌp/',
    meaning: 'being present, engaged, and dependable',
    status: 'new',
    videoId: 'v5',
  },
  {
    id: 'w6',
    word: 'at the end of the day',
    ipa: '/ət ði end əv ðə deɪ/',
    meaning: 'when everything has been considered',
    status: 'learning',
    videoId: 'v4',
  },
  {
    id: 'w7',
    word: 'expect',
    ipa: '/ɪkˈspekt/',
    meaning: 'to think something is likely to happen',
    status: 'known',
    videoId: 'v3',
  },
  {
    id: 'w8',
    word: 'kind of',
    ipa: '/kaɪnd əv/',
    meaning: 'somewhat; to a certain extent',
    status: 'new',
    videoId: 'v1',
  },
]

export const NEED_PRACTICE: NeedPracticeItem[] = [
  { id: 'n1', title: 'Question-final stress', detail: 'Missed in 6/10 recent attempts', videoId: 'v1' },
  {
    id: 'n2',
    title: 'Linking consonant → vowel across words',
    detail: 'Missed in 5/9 recent attempts',
    videoId: 'v4',
  },
  { id: 'n3', title: 'Falling intonation on statements', detail: 'Missed in 4/8 recent attempts', videoId: 'v2' },
]

/** Stand-in for a dictionary / translation API on tapped caption words. */
export const LOOKUP: Record<string, { ipa: string; meaning: string }> = {
  expecting: { ipa: '/ɪkˈspektɪŋ/', meaning: 'anticipating that something will happen' },
  reaction: { ipa: '/riˈækʃən/', meaning: 'a response to something that happens' },
  winning: { ipa: '/ˈwɪnɪŋ/', meaning: 'succeeding or coming first in a contest' },
  showing: { ipa: '/ˈʃəʊɪŋ/', meaning: 'letting something be seen' },
  consistency: { ipa: '/kənˈsɪstənsi/', meaning: 'acting the same way over time' },
  finished: { ipa: '/ˈfɪnɪʃt/', meaning: 'completed; done with something' },
  minute: { ipa: '/ˈmɪnɪt/', meaning: 'a short period of time' },
  little: { ipa: '/ˈlɪtl/', meaning: 'small in size or amount' },
  question: { ipa: '/ˈkwestʃən/', meaning: 'something you ask to get information' },
  worth: { ipa: '/wɜːθ/', meaning: 'deserving of the time or effort' },
  step: { ipa: '/step/', meaning: 'one stage in a process' },
  myself: { ipa: '/maɪˈself/', meaning: 'used to refer back to the speaker' },
  actually: { ipa: '/ˈæktʃuəli/', meaning: 'in fact; really' },
  almost: { ipa: '/ˈɔːlməʊst/', meaning: 'very nearly but not completely' },
  really: { ipa: '/ˈrɪəli/', meaning: 'in actual fact; very' },
}

export const DEFAULT_PROFILE = {
  name: 'Mai Nguyen',
  email: 'mai.nguyen@gmail.com',
  avatarKey: null,
}
