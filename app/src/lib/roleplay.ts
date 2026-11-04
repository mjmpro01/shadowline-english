import { useEffect, useState } from 'react'
import type { Translate } from '../i18n'
import type { Roleplay } from '../repository'
import { tutorEnabled } from './tutor'

/** Whether there is a tutor to role-play with; null until the server says. */
export function useTutorEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  useEffect(() => {
    let wanted = true
    void tutorEnabled().then((on) => wanted && setEnabled(on))
    return () => {
      wanted = false
    }
  }, [])
  return enabled
}

/** What a role-play is called: its scenario's name, in the app's language, or
 *  the title of the dialogue it played. */
export function roleplayName(r: Pick<Roleplay, 'scenario' | 'title'>, t: Translate): string {
  if (r.scenario === 'interview') return t('roleplay.interview')
  if (r.scenario === 'presentation') return t('roleplay.presentation')
  return r.title
}
