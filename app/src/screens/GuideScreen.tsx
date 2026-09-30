import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Icon, type IconName } from '../components/Icon'
import { Mascot } from '../components/Mascot'
import { useT, type Translate } from '../i18n'
import type { MessageKey } from '../i18n/en'
import { useTour } from '../tour/context'
import { PLAYHEAD_RED, SOURCE_PURPLE, SOURCE_PURPLE_FILL, YOU_CYAN, YOU_CYAN_FILL } from '../lib/practiceGuide'

interface Step {
  icon: IconName
  title: MessageKey
  body: MessageKey
  /** The buttons this step presses, named by the keys the screens use, so the
   *  guide says exactly what is on the button in either language — and a
   *  button renamed on its screen is renamed here too. */
  buttons: MessageKey[]
  extra?: 'wave' | 'tiers'
}

/** One line, from choosing it to moving on: the part a new learner needs first. */
const PRACTICE: Step[] = [
  { icon: 'book-open', title: 'guide.pick.title', body: 'guide.pick.body', buttons: ['nav.library', 'library.practice'] },
  { icon: 'play', title: 'guide.listen.title', body: 'guide.listen.body', buttons: ['practice.watchClip', 'practice.hearClip'] },
  {
    icon: 'mic',
    title: 'guide.record.title',
    body: 'guide.record.body',
    buttons: ['practice.record', 'practice.stop'],
    extra: 'wave',
  },
  {
    icon: 'trophy',
    title: 'guide.score.title',
    body: 'guide.score.body',
    buttons: ['practice.rerecord', 'practice.seeAnalysis'],
    extra: 'tiers',
  },
  { icon: 'chevron-right', title: 'guide.next.title', body: 'guide.next.body', buttons: ['practice.nextLine'] },
]

/** What there is beyond one line, once the first one has been done. */
const MORE: Step[] = [
  {
    icon: 'message-square',
    title: 'guide.words.title',
    body: 'guide.words.body',
    buttons: ['nav.vocabulary', 'vocab.memoryPractice'],
  },
  { icon: 'volume', title: 'guide.dub.title', body: 'guide.dub.body', buttons: ['practice.dubReview', 'practice.saveDub'] },
  { icon: 'chart-line', title: 'guide.progress.title', body: 'guide.progress.body', buttons: ['nav.progress'] },
]

const TIPS: MessageKey[] = ['guide.tip.quiet', 'guide.tip.headphones', 'guide.tip.listenFirst', 'guide.tip.tune']

/** Answers that name a button take its label from the screen's own key. */
const FAQ: { q: MessageKey; a: (t: Translate) => string }[] = [
  { q: 'guide.faq.mic.q', a: (t) => t('guide.faq.mic.a', t('practice.resetMic')) },
  { q: 'guide.faq.noOriginal.q', a: (t) => t('guide.faq.noOriginal.a') },
  { q: 'guide.faq.tooShort.q', a: (t) => t('guide.faq.tooShort.a', t('practice.rerecord')) },
  { q: 'guide.faq.score.q', a: (t) => t('guide.faq.score.a') },
  { q: 'guide.faq.words.q', a: (t) => t('guide.faq.words.a') },
]

const SECTIONS: { id: string; label: MessageKey }[] = [
  { id: 'practice', label: 'guide.practiceTitle' },
  { id: 'more', label: 'guide.moreTitle' },
  { id: 'tips', label: 'guide.tipsTitle' },
  { id: 'help', label: 'guide.helpTitle' },
]

/**
 * How to use Shadowline, for somebody who has just signed up.
 *
 * The first-steps card on the dashboard says what the app is for in three
 * words; this is the rest of it — each step of practising a line, what the
 * two waves and the score mean, what else there is, and what to do when the
 * microphone or a clip does not behave. Other screens link to a section of it
 * by id (`/guide#practice`).
 */
export function GuideScreen() {
  const t = useT()
  const { hash } = useLocation()
  const navigate = useNavigate()
  const tour = useTour()

  // The router moves between screens without the browser's own jump to an id,
  // so a link to a section scrolls to it here.
  useEffect(() => {
    if (!hash) return
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [hash])

  return (
    <div className="stack gap-6 guide" style={{ maxWidth: 820 }}>
      <section className="card elev-sm guide-hero">
        <div className="guide-hero-art" aria-hidden="true">
          <Mascot whole mood="walk" size={112} />
        </div>
        <div className="stack gap-2" style={{ minWidth: 0 }}>
          <h1 className="guide-title">{t('guide.title')}</h1>
          <p className="guide-lead">{t('guide.lead')}</p>
          <div>
            {/* From the dashboard, where the tour's first popup points. */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                navigate('/dashboard')
                tour.start()
              }}
            >
              <Icon name="play" size={16} />
              {t('tour.replay')}
            </button>
          </div>
          <nav className="row gap-2 wrap" aria-label={t('guide.contents')}>
            {SECTIONS.map((section) => (
              <a key={section.id} className="tag tag-neutral guide-jump" href={`#${section.id}`}>
                {t(section.label)}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section id="practice" className="stack gap-3 guide-section">
        <h2 className="guide-heading">{t('guide.practiceTitle')}</h2>
        <p className="card-meta guide-intro">{t('guide.practiceIntro')}</p>
        <ol className="guide-steps">
          {PRACTICE.map((step, i) => (
            <StepCard key={step.title} step={step} number={i + 1} />
          ))}
        </ol>
      </section>

      <section id="more" className="stack gap-3 guide-section">
        <h2 className="guide-heading">{t('guide.moreTitle')}</h2>
        <ul className="guide-steps">
          {MORE.map((step) => (
            <StepCard key={step.title} step={step} />
          ))}
        </ul>
      </section>

      <section id="tips" className="card elev-sm stack gap-2 guide-section">
        <h2 className="guide-heading">{t('guide.tipsTitle')}</h2>
        <ul className="guide-tips">
          {TIPS.map((tip) => (
            <li key={tip}>{t(tip)}</li>
          ))}
          <li>{t('guide.tip.tutor', t('tutor.open'))}</li>
        </ul>
      </section>

      <section id="help" className="stack gap-2 guide-section">
        <h2 className="guide-heading">{t('guide.helpTitle')}</h2>
        {FAQ.map((item) => (
          <details key={item.q} className="card elev-sm guide-faq">
            <summary>{t(item.q)}</summary>
            <p>{item.a(t)}</p>
          </details>
        ))}
      </section>

      <section className="card elev-sm guide-cta">
        <Mascot mood="cheer" size={72} />
        <div className="stack gap-2" style={{ minWidth: 0, flex: 1 }}>
          <div className="card-title">{t('guide.readyTitle')}</div>
          <div className="card-meta">{t('guide.readyBody')}</div>
        </div>
        <Link className="btn btn-primary" to="/library">
          <Icon name="mic" size={18} />
          {t('guide.readyGo')}
        </Link>
      </section>
    </div>
  )
}

function StepCard({ step, number }: { step: Step; number?: number }) {
  const t = useT()
  return (
    <li className="card elev-sm guide-step">
      <span className="guide-step-mark" aria-hidden="true">
        {number ?? <Icon name={step.icon} size={18} />}
      </span>
      <div className="stack gap-2" style={{ minWidth: 0 }}>
        <h3 className="guide-step-title">{t(step.title)}</h3>
        <p className="guide-step-body">{t(step.body)}</p>
        {step.extra === 'wave' && <WaveLegend />}
        {step.extra === 'tiers' && <Tiers />}
        <div className="row gap-2 wrap">
          {step.buttons.map((button) => (
            <ButtonName key={button}>{t(button)}</ButtonName>
          ))}
        </div>
      </div>
    </li>
  )
}

/** A button's name as it appears on its screen, drawn like a key to press. */
function ButtonName({ children }: { children: ReactNode }) {
  return <kbd className="guide-button">{children}</kbd>
}

/** The practice strip in miniature: what purple, cyan and the red line are. */
function WaveLegend() {
  const t = useT()
  const wave = (amp: number[], y = 30) =>
    `M${amp.map((a, i) => `${10 + i * 20},${y - a}`).join(' L')} L${amp
      .map((a, i) => `${10 + i * 20},${y + a}`)
      .reverse()
      .join(' L')} Z`
  return (
    <div className="guide-wave">
      <svg viewBox="0 0 250 60" width="100%" role="img" aria-label={t('guide.waveLabel')}>
        <path d={wave([2, 14, 22, 10, 18, 24, 8, 16, 20, 12, 6, 16, 2])} fill={SOURCE_PURPLE_FILL} />
        <path d={wave([2, 10, 18, 12, 14, 20, 6])} fill={YOU_CYAN_FILL} />
        <line x1="130" y1="4" x2="130" y2="56" stroke={PLAYHEAD_RED} strokeWidth="2" />
      </svg>
      <ul className="guide-wave-key">
        <li>
          <span style={{ background: SOURCE_PURPLE }} />
          {t('guide.wavePurple')}
        </li>
        <li>
          <span style={{ background: YOU_CYAN }} />
          {t('guide.waveCyan')}
        </li>
        <li>
          <span style={{ background: PLAYHEAD_RED }} />
          {t('guide.waveRed')}
        </li>
      </ul>
    </div>
  )
}

/** The three bands a score lands in, with the numbers that divide them. */
function Tiers() {
  const t = useT()
  return (
    <div className="row gap-2 wrap">
      <span className="tag tier-bronze">{t('guide.tierBronze', t('tier.bronze'))}</span>
      <span className="tag tier-silver">{t('guide.tierSilver', t('tier.silver'))}</span>
      <span className="tag tier-gold">{t('guide.tierGold', t('tier.gold'))}</span>
    </div>
  )
}
