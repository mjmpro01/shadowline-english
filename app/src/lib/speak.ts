/**
 * Saying an English phrase aloud, with the voice the browser already has.
 *
 * The tutor writes its examples in bold and italics — "**break the ice**",
 * "*I have been*" — and a learner reading "how do I say this" wants to hear it
 * said. The Web Speech API does that on every current browser with no request
 * and no cost; where it is missing the phrases simply stay text.
 */

/** Vietnamese letters English never uses. A phrase with any of these is the
 *  tutor's explanation, not an example to say. */
const VIETNAMESE = /[ăâđêôơưàáạảãầấậẩẫằắặẳẵèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i

/** Whether a phrase is English worth saying: Latin letters, no Vietnamese, not
 *  IPA in slashes, not a paragraph. */
export function sayable(text: string): boolean {
  const phrase = text.trim()
  if (!phrase || phrase.length > 120) return false
  if (phrase.startsWith('/') || VIETNAMESE.test(phrase)) return false
  // Mostly letters: "affect" and "I'll be there" are; "44" and "→" are not.
  const letters = phrase.match(/[a-z]/gi)?.length ?? 0
  return letters >= 2 && letters / phrase.replace(/\s/g, '').length > 0.6
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** The browser's English voices, US first then UK then the rest. */
function englishVoices(): SpeechSynthesisVoice[] {
  const rank = (v: SpeechSynthesisVoice) => (v.lang === 'en-US' ? 0 : v.lang === 'en-GB' ? 1 : 2)
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith('en'))
    .sort((a, b) => rank(a) - rank(b))
}

export interface SpeakOptions {
  /** Which of two people is talking, so a dialogue is two voices: the second
   *  takes the browser's next English voice, or the same one lower when there
   *  is only one. */
  voice?: 0 | 1
  /** Called when it has been said, or was stopped. Not when something else
   *  said after it cut it off. */
  onEnd?: () => void
}

/** What is being said now, so an utterance cut off by the next one does not
 *  report itself finished. */
let current: SpeechSynthesisUtterance | null = null

/** Says a phrase, stopping anything still being said. Slightly slow: it is
 *  said to be copied, not to be overheard. */
export function speak(text: string, { voice = 0, onEnd }: SpeakOptions = {}) {
  if (!canSpeak()) {
    onEnd?.()
    return
  }
  const phrase = text.replace(/["“”]/g, '').trim()
  const utterance = new SpeechSynthesisUtterance(phrase)
  utterance.lang = 'en-US'
  utterance.rate = 0.9
  const voices = englishVoices()
  const chosen = voices[Math.min(voice, voices.length - 1)]
  if (chosen) utterance.voice = chosen
  if (voice === 1 && voices.length < 2) utterance.pitch = 0.75
  const done = () => {
    if (current !== utterance) return
    current = null
    onEnd?.()
  }
  utterance.onend = done
  utterance.onerror = done
  current = utterance
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

/** Stops whatever is being said, without its onEnd. */
export function stopSpeaking() {
  current = null
  if (canSpeak()) window.speechSynthesis.cancel()
}
