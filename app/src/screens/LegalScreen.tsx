import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { LOCALE_CODES, LOCALES, useI18n } from '../i18n'
import { LEGAL, UPDATED, type LegalKind } from '../legal/content'

/**
 * The privacy policy or the terms of service.
 *
 * Public: Google's consent screen links here, and so does the login screen, so
 * it is read by people with no account and by Google's reviewers. It reads
 * nothing from the API and works the same signed in or out.
 */
export function LegalScreen({ kind }: { kind: LegalKind }) {
  const { t, locale, setLocale } = useI18n()
  const doc = LEGAL[kind][locale]
  const other: LegalKind = kind === 'privacy' ? 'terms' : 'privacy'

  useEffect(() => {
    document.title = `${doc.title} · Shadowline English`
  }, [doc.title])

  const updated = new Date(`${UPDATED}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <main className="legal" lang={locale}>
      <header className="legal-top">
        <Link to="/login" className="legal-brand">
          <img src="/login/crest.webp" alt="" width={36} height={36} />
          <span>Shadowline English</span>
        </Link>
        <div className="legal-langs" role="group" aria-label={t('profile.language')}>
          {LOCALE_CODES.map((code) => (
            <button
              type="button"
              key={code}
              lang={code}
              aria-pressed={code === locale}
              onClick={() => setLocale(code)}
            >
              {LOCALES[code].name}
            </button>
          ))}
        </div>
      </header>

      <article className="legal-doc">
        <h1>{doc.title}</h1>
        <p className="legal-updated">{t('legal.updated', updated)}</p>
        <p className="legal-intro">{doc.intro}</p>

        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((block, i) =>
              typeof block === 'string' ? (
                <p key={i}>{block}</p>
              ) : (
                <ul key={i}>
                  {block.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ),
            )}
          </section>
        ))}
      </article>

      <footer className="legal-foot">
        <Link to={`/${other}`}>{t(`legal.${other}`)}</Link>
        <span aria-hidden="true">·</span>
        <Link to="/login">{t('legal.back')}</Link>
      </footer>
    </main>
  )
}
