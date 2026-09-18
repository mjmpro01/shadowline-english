import { describe, expect, it } from 'vitest'
import { en } from '../src/i18n/en'
import { vi } from '../src/i18n/vi'
import { LOCALES, preferredLocale } from '../src/i18n'

const LOCALE_ENTRIES = Object.entries(LOCALES)

describe('locales', () => {
  // The types already refuse a locale with the wrong keys. This is here for the
  // day somebody silences that with a cast: a missing key would otherwise show
  // up as `undefined` on screen rather than as a failing build.
  it('all speak the same keys', () => {
    const keys = Object.keys(en).sort()
    for (const [code, locale] of LOCALE_ENTRIES) {
      expect(Object.keys(locale.messages).sort(), code).toEqual(keys)
    }
  })

  it('takes the same arguments everywhere', () => {
    for (const [code, locale] of LOCALE_ENTRIES) {
      for (const [key, english] of Object.entries(en)) {
        const mine = (locale.messages as Record<string, unknown>)[key]
        expect(typeof mine, `${code}/${key}`).toBe(typeof english)
        if (typeof english === 'function') {
          expect((mine as (...a: never[]) => string).length, `${code}/${key}`).toBe(english.length)
        }
      }
    }
  })

  it('leaves nothing untranslated', () => {
    const untranslated = Object.entries(en).filter(
      ([key, english]) =>
        typeof english === 'string' &&
        english === (vi as Record<string, unknown>)[key] &&
        // Words that are the same in both on purpose. "Email" and "Playlist"
        // are the Vietnamese too, and a message that is only punctuation or a
        // proper noun has nothing to translate.
        !['profile.email', 'studio.playlist'].includes(key),
    )
    expect(untranslated.map(([key]) => key)).toEqual([])
  })

  it('names each language in its own language', () => {
    // Somebody stuck in a language they cannot read has to find their own in
    // the list, and "Vietnamese" is no help to them.
    expect(LOCALES.en.name).toBe('English')
    expect(LOCALES.vi.name).toBe('Tiếng Việt')
  })
})

describe('preferredLocale', () => {
  it('honours a choice already made', () => {
    expect(preferredLocale('vi', ['en-GB'])).toBe('vi')
    expect(preferredLocale('en', ['vi-VN'])).toBe('en')
  })

  it('ignores a stored value it does not recognise', () => {
    expect(preferredLocale('kl', ['vi-VN'])).toBe('vi')
  })

  it('reads the browser in its own order of preference', () => {
    // The first language we speak wins, not the first language listed: somebody
    // whose top choice we have no words for still gets their second.
    expect(preferredLocale(null, ['fr-FR', 'vi-VN', 'en-US'])).toBe('vi')
    expect(preferredLocale(null, ['vi'])).toBe('vi')
  })

  it('ignores the region', () => {
    expect(preferredLocale(null, ['VI-vn'])).toBe('vi')
  })

  it('falls back to the language the app is written in', () => {
    expect(preferredLocale(null, ['fr-FR'])).toBe('en')
    expect(preferredLocale(null, [])).toBe('en')
  })
})
