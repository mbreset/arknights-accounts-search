import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import './SearchOptions.css'

export function SearchOptions({ showPotential, onChange, onOpen }: {
  showPotential: boolean
  onChange: (value: boolean) => void
  onOpen: () => void
}) {
  const [open, setOpen] = useState(false)
  const [left, setLeft] = useState(0)
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const checkbox = useRef<HTMLInputElement>(null)
  const id = useId()
  useLayoutEffect(() => {
    if (!open || !root.current) return
    const bounds = root.current.getBoundingClientRect()
    setLeft(Math.max(8, Math.min(bounds.right - 184, window.innerWidth - 192)) - bounds.left)
  }, [open])
  useEffect(() => {
    if (!open) return
    checkbox.current?.focus({ preventScroll: true })
    const closeOutside = (event: Event) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('focusin', closeOutside)
    const resized = () => setOpen(false)
    window.addEventListener('resize', resized)
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('focusin', closeOutside)
      window.removeEventListener('resize', resized)
    }
  }, [open])
  return <span className="search-options" ref={root} onClick={event => event.stopPropagation()}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
    }}>
    <button ref={trigger} className={`icon-button${showPotential ? ' search-options-enabled' : ''}`} type="button"
      aria-label="검색 옵션" title="검색 옵션" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (!open) onOpen(); setOpen(value => !value) }}>
      <SlidersHorizontal size={17} />
    </button>
    {open && <span className="search-options-panel" id={id} role="group" aria-label="검색 옵션 설정" style={{ left }}>
      <label><input ref={checkbox} type="checkbox" checked={showPotential} onChange={event => onChange(event.target.checked)} />잠재 선택 표시</label>
    </span>}
  </span>
}
