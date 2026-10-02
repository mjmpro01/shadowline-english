import type { Translate } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { ApiError } from './api'

/** Codes the server names its errors by, and the message each one reads as. */
const BY_CODE: Record<string, MessageKey> = {
  signIn: 'error.signIn',
  server: 'error.server',
  'login.wrong': 'error.loginWrong',
  'login.missing': 'error.loginMissing',
  'login.unavailable': 'error.loginUnavailable',
  'password.short': 'error.passwordShort',
  'password.none': 'error.passwordNone',
  'email.unconfirmed': 'login.error.unverified',
  'account.suspended': 'login.error.suspended',
  'delete.confirm': 'error.deleteConfirm',
  'name.empty': 'error.nameEmpty',
  'limit.signIn': 'error.limitSignIn',
  'limit.accounts': 'error.limitAccounts',
  'limit.requests': 'error.limitRequests',
  'limit.passwords': 'error.limitPasswords',
  'limit.words': 'error.limitWords',
  'word.tooLong': 'error.wordTooLong',
  'dub.noVideo': 'error.dubNoVideo',
  'tutor.unreachable': 'error.tutorUnreachable',
  'tutor.silent': 'error.tutorSilent',
  'tutor.empty': 'error.tutorEmpty',
  'tutor.tooLong': 'error.tutorTooLong',
  'tutor.unavailable': 'error.tutorUnavailable',
  'tutor.everyone': 'error.tutorEveryone',
}

/**
 * What to tell the learner about an error, in their language.
 *
 * The server's messages are English. The ones a learner can meet carry a code,
 * and the code is what is looked up here; an error without a known code still
 * says what the server said, which beats a vaguer sentence in the right
 * language. `fallback` is for what is not an API error at all.
 */
export function explain(err: unknown, t: Translate, fallback: string): string {
  if (!(err instanceof ApiError)) return fallback
  if (err.status === 0) return t('error.network')
  // The wait comes from Retry-After. Without one (a proxy that drops it), the
  // refusal is still worded, just without a number that would be made up.
  const wait = err.retryAfter
  if (err.code === 'tutor.window')
    return wait ? t('error.tutorWindow', Math.ceil(wait)) : t('error.tutorWindowSoon')
  if (err.code === 'tutor.day') return wait ? t('error.tutorDay', Math.max(1, Math.round(wait / 3600))) : t('error.tutorDaySoon')
  const key = err.code ? BY_CODE[err.code] : undefined
  return key ? t(key) : err.message
}

/**
 * Why a take could not be scored, from the reason the scorer wrote down.
 *
 * The scorer is not the API and has no codes: its reasons are a few fixed
 * English sentences, matched here by how they begin.
 */
export function takeProblem(reason: string | null | undefined, t: Translate): string | null {
  if (!reason) return null
  if (reason.startsWith('no speech found')) return t('error.takeNoSpeech')
  if (reason.startsWith('could not read the recording') || reason.startsWith('recording is missing'))
    return t('error.takeUnreadable')
  if (reason === 'scoring failed') return t('error.takeFailed')
  return reason
}
