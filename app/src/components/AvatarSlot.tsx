import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useT } from '../i18n'
import { ACCEPTED_IMAGE_TYPES, isAcceptedImage, prepareAvatar } from '../lib/image'

/**
 * Replacement for the prototype's <image-slot> element: click or drop an image,
 * downscaled client-side before it is handed to the caller.
 */
export function AvatarSlot({
  src,
  size,
  editable = false,
  onPick,
}: {
  src: string | null
  size: number
  editable?: boolean
  onPick?: (blob: Blob) => void
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const accept = async (file: File | undefined) => {
    if (!file) return
    if (!isAcceptedImage(file)) {
      setError('Use a PNG, JPEG, WebP or AVIF image')
      return
    }
    try {
      const blob = await prepareAvatar(file)
      setError(null)
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old)
        return URL.createObjectURL(blob)
      })
      onPick?.(blob)
    } catch {
      setError("That image couldn't be read")
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void accept(e.dataTransfer.files[0])
  }

  const shown = preview ?? src

  return (
    <div className="stack gap-1" style={{ width: size }}>
      <button
        type="button"
        className="avatar-slot"
        data-dragging={dragging}
        style={{ width: size, height: size, cursor: editable ? 'pointer' : 'default' }}
        onClick={() => editable && inputRef.current?.click()}
        onDragOver={(e) => {
          if (!editable) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={editable ? onDrop : undefined}
        aria-label={editable ? t('profile.changeAvatar') : t('profile.avatar')}
      >
        {shown ? <img src={shown} alt="" /> : 'Avatar'}
      </button>
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          hidden
          onChange={(e) => void accept(e.target.files?.[0])}
        />
      )}
      {error && <div style={{ fontSize: 11, color: 'var(--score-attention)' }}>{error}</div>}
    </div>
  )
}
