import type { ReactNode } from 'react'

interface Option<T extends string> {
  value: T
  label: ReactNode
}

export function SegmentedControl<T extends string>({
  name,
  value,
  options,
  onChange,
  className,
}: {
  name: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={className ? `seg ${className}` : 'seg'}>
      {options.map((opt) => (
        <label className="seg-opt" key={opt.value}>
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}
