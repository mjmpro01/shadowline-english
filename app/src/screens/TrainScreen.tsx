import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from '../components/Icon'

/**
 * Practice, on a phone: its one tab for both kinds, opening onto a choice of
 * them. A wider screen has a plank for each and never needs this page.
 */
export function TrainScreen() {
  const t = useT()
  return (
    <div className="stack gap-6">
      <div className="stack" style={{ gap: 4 }}>
        <h1 style={{ margin: 0 }}>{t('nav.train')}</h1>
        <div className="card-meta">{t('train.intro')}</div>
      </div>
      <div className="stack gap-3">
        <Link to="/dictation" className="card elev-sm train-choice">
          <Icon name="square-pen" size={28} />
          <span className="stack" style={{ gap: 2 }}>
            <span className="card-title">{t('nav.dictation')}</span>
            <span className="card-meta">{t('train.dictationBody')}</span>
          </span>
        </Link>
        <Link to="/dialogues" className="card elev-sm train-choice">
          <Icon name="messages-square" size={28} />
          <span className="stack" style={{ gap: 2 }}>
            <span className="card-title">{t('nav.dialogues')}</span>
            <span className="card-meta">{t('train.dialoguesBody')}</span>
          </span>
        </Link>
        <Link to="/dialogues/phrasebook" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>
          <Icon name="notebook-pen" size={16} />
          {t('phrasebook.title')}
        </Link>
      </div>
    </div>
  )
}
