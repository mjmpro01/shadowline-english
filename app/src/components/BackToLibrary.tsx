import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'
import type { Video } from '../data/types'

/**
 * The way back up out of a clip.
 *
 * To the episode it was cut from when there is one, because that is where the
 * learner came from and where the next line is. The library itself is the
 * fallback, for a clip published before episodes existed and for one an admin
 * has moved out of every series.
 */
export function BackToLibrary({ clip }: { clip: Video }) {
  const navigate = useNavigate()
  const t = useT()
  const episode = clip.episodeId
  return (
    <button
      type="button"
      className="btn btn-ghost"
      style={{ alignSelf: 'flex-start' }}
      onClick={() => navigate(episode ? `/library/e/${episode}` : '/library')}
    >
      <Icon name="chevron-left" />
      {episode ? t('analysis.backToEpisode') : t('series.back')}
    </button>
  )
}
