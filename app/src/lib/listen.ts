import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hearing a learner say a line, with the speech recognition the browser
 * already has.
 *
 * Chrome, Edge and Safari have it, as `webkitSpeechRecognition`; Firefox does
 * not, and nor does a headless browser. Where it is missing a reading aloud is
 * counted on the learner's word instead, so nothing here is required.
 */

interface RecognitionResult {
  readonly length: number
  [index: number]: { transcript: string }
}

interface RecognitionEvent {
  readonly results: { readonly length: number; [index: number]: RecognitionResult }
}

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

export function canListen(): boolean {
  return recognitionClass() !== undefined
}

export interface Listener {
  listening: boolean
  /** What has been heard so far, while listening and after. */
  said: string
  /** Why it stopped hearing anything, when it did: "not-allowed" when the
   *  microphone was refused. */
  failed: string | null
  /** Listens for one thing said, and resolves with all of it once the speaker
   *  stops — empty when nothing was heard. */
  listen(): Promise<string>
  stop(): void
}

export function useListener(): Listener {
  const [listening, setListening] = useState(false)
  const [said, setSaid] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const active = useRef<Recognition | null>(null)

  useEffect(() => () => active.current?.abort(), [])

  const listen = useCallback(() => {
    active.current?.abort()
    const Class = recognitionClass()
    if (!Class) return Promise.resolve('')
    return new Promise<string>((resolve) => {
      const recognition = new Class()
      recognition.lang = 'en-US'
      recognition.interimResults = true
      recognition.continuous = false
      recognition.maxAlternatives = 1
      let heard = ''
      recognition.onresult = (event) => {
        heard = Array.from({ length: event.results.length }, (_, i) => event.results[i][0]?.transcript ?? '')
          .join(' ')
          .trim()
        setSaid(heard)
      }
      recognition.onerror = (event) => {
        // Silence is not a failure worth a message: the line just was not said.
        if (event.error !== 'no-speech' && event.error !== 'aborted') setFailed(event.error)
      }
      recognition.onend = () => {
        if (active.current === recognition) active.current = null
        setListening(false)
        resolve(heard)
      }
      active.current = recognition
      setSaid('')
      setFailed(null)
      setListening(true)
      try {
        recognition.start()
      } catch {
        active.current = null
        setListening(false)
        resolve('')
      }
    })
  }, [])

  const stop = useCallback(() => active.current?.stop(), [])

  return { listening, said, failed, listen, stop }
}
