import { useT } from '../i18n'
import { Dialog } from './Dialog'

/**
 * The last question before something goes for good.
 *
 * Every delete in this app takes objects with it — a recording, a video, a
 * whole episode's worth of both — and none of it can be put back. So the
 * dialog says what is about to go, in a sentence the caller writes, rather
 * than asking "are you sure?" about a noun the learner has to guess.
 */
export function ConfirmDelete({
  title,
  body,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useT()
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {t('common.delete')}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{body}</p>
    </Dialog>
  )
}
