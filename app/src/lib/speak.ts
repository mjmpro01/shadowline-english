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

/** An English voice, preferring US then UK, when the browser has one. */
function englishVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang === 'en-US') ??
    voices.find((v) => v.lang === 'en-GB') ??
    voices.find((v) => v.lang.startsWith('en'))
  )
}

/** Says a phrase, stopping anything still being said. Slightly slow: it is
 *  said to be copied, not to be overheard. */
export function speak(text: string) {
  if (!canSpeak()) return
  const phrase = text.replace(/["“”]/g, '').trim()
  const utterance = new SpeechSynthesisUtterance(phrase)
  utterance.lang = 'en-US'
  utterance.rate = 0.9
  const voice = englishVoice()
  if (voice) utterance.voice = voice
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}
