import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { LOCALE_CODES, LOCALES, useI18n } from '../i18n'
import { CONTACT_EMAIL } from '../legal/content'
import { useApp } from '../store/context'

/**
 * The home page: what Shadowline English is, readable without an account.
 *
 * Google's OAuth verification insists on one — a home page that names the app
 * the way the consent screen does, explains what it is for and is not behind a
 * login. Somebody already signed in has seen it and goes straight to practice.
 *
 * It does not wait for the session check: the page is the same either way, and
 * a visitor with no account should not watch a spinner to read it.
 */
export function HomeScreen() {
  const { state, signedIn } = useApp()
  const { t, locale, setLocale } = useI18n()

  useEffect(() => {
    document.title = 'Shadowline English — practise speaking English by shadowing'
  }, [])

  if (state === 'ready' && signedIn) return <Navigate to="/dashboard" replace />

  const steps = [
    { n: 1, title: t('home.step1Title'), body: t('home.step1Body') },
    { n: 2, title: t('home.step2Title'), body: t('home.step2Body') },
    { n: 3, title: t('home.step3Title'), body: t('home.step3Body') },
  ]
  const features = [
    { icon: '〰', title: t('home.f1Title'), body: t('home.f1Body') },
    { icon: '★', title: t('home.f2Title'), body: t('home.f2Body') },
    { icon: '?', title: t('home.f3Title'), body: t('home.f3Body') },
    { icon: '▲', title: t('home.f4Title'), body: t('home.f4Body') },
  ]

  return (
    <div className="home" lang={locale}>
      <header className="home-hero">
        <div className="login-hero-bg" aria-hidden="true" />
        <nav className="home-nav">
          <span className="home-logo">
            <img src="/login/crest.webp" alt="" width={36} height={36} />
            <span>Shadowline English</span>
          </span>
          <span className="home-nav-end">
            <span className="home-langs" role="group" aria-label={t('profile.language')}>
              {LOCALE_CODES.map((code) => (
                <button
                  type="button"
                  key={code}
                  lang={code}
                  aria-pressed={code === locale}
                  onClick={() => setLocale(code)}
                >
                  {code.toUpperCase()}
                  <span className="visually-hidden"> {LOCALES[code].name}</span>
                </button>
              ))}
            </span>
            <Link to="/login" className="home-nav-signin">
              {t('home.signIn')}
            </Link>
          </span>
        </nav>

        <div className="home-hero-body">
          <div className="login-crest" aria-hidden="true">
            <img src="/login/crest.webp" alt="" width={90} height={90} />
          </div>
          <h1 className="home-title">
            Shadowline <span>English</span>
          </h1>
          <p className="home-tagline">{t('home.tagline')}</p>
          <div className="home-cta">
            <Link to="/login" className="login-submit home-cta-main">
              {t('home.start')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="home-section" aria-labelledby="home-how">
          <h2 id="home-how">{t('home.howTitle')}</h2>
          <ol className="home-steps">
            {steps.map((step) => (
              <li key={step.n}>
                <span className="home-step-n" aria-hidden="true">
                  {step.n}
                </span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-section" aria-labelledby="home-features">
          <h2 id="home-features">{t('home.featuresTitle')}</h2>
          <ul className="home-features">
            {features.map((f) => (
              <li key={f.title}>
                <span className="home-feature-icon" aria-hidden="true">
                  {f.icon}
                </span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="home-section home-safe" aria-labelledby="home-safe">
          <h2 id="home-safe">{t('home.safeTitle')}</h2>
          <p>{t('home.safeBody')}</p>
          <p className="home-safe-links">
            <Link to="/privacy">{t('legal.privacy')}</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms">{t('legal.terms')}</Link>
          </p>
        </section>

        <section className="home-section home-final">
          <h2>{t('home.ctaTitle')}</h2>
          <Link to="/login" className="login-submit home-cta-main">
            {t('home.start')}
          </Link>
        </section>
      </main>

      <footer className="home-foot">
        <span>
          © {new Date().getFullYear()} Shadowline English. {t('home.rights')}
        </span>
        <nav className="home-foot-links">
          <Link to="/privacy">{t('legal.privacy')}</Link>
          <Link to="/terms">{t('legal.terms')}</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{t('home.contact')}</a>
        </nav>
      </footer>
    </div>
  )
}
