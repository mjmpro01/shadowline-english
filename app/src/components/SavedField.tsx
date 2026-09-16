import { useState } from 'react'

/**
 * A text field that keeps its own draft and saves when you leave it.
 *
 * The studio's editors used to call the store on every keystroke. Against
 * localStorage that was free; against an API it is a request per character, and
 * the last few would race each other to decide what the clip is called.
 */
export function SavedField({
  id,
  label,
  value,
  onSave,
  style,
}: {
  id: string
  label: string
  value: string
  onSave: (next: string) => void
  style?: React.CSSProperties
}) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(value)

  // Follow the record when it changes underneath — after a reload, or when a
  // different clip takes this slot in the list. Adjusted during render rather
  // than in an effect, so the field never paints the stale value first.
  if (value !== saved) {
    setSaved(value)
    setDraft(value)
  }

  const commit = () => {
    if (draft !== value) onSave(draft)
  }

  return (
    <div className="field" style={style}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setDraft(value)
        }}
      />
    </div>
  )
}
