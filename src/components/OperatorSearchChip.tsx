import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, X } from 'lucide-react'
import { operatorTermLabel, type OperatorSearchTerm } from '../operatorSearch'
import './OperatorSearchChip.css'

const options = [1, 2, 3, 4, 5, 6]
const optionLabel = (value: number) => value === 1 ? '제한 없음' : value === 6 ? '6잠' : `${value}잠 이상`

export function OperatorSearchChip({ term, showPotential, onChange, onRemove, onOpen }: {
  term: OperatorSearchTerm
  showPotential: boolean
  onChange: (potential: number) => void
  onRemove: () => void
  onOpen: () => void
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const items = useRef<Array<HTMLButtonElement | null>>([])
  const id = useId()
  const label = term.potential === 1 ? '잠재' : `${term.potential}+`
  useEffect(() => { if (!showPotential) setOpen(false) }, [showPotential])
  const dismiss = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return
    const anchor = trigger.current.getBoundingClientRect()
    const bounds = menu.current.getBoundingClientRect()
    const viewport = window.visualViewport
    const leftEdge = viewport?.offsetLeft ?? 0
    const topEdge = viewport?.offsetTop ?? 0
    const width = viewport?.width ?? window.innerWidth
    const height = viewport?.height ?? window.innerHeight
    const below = anchor.bottom + 6
    setPosition({
      left: Math.max(leftEdge + 8, Math.min(anchor.left, leftEdge + width - bounds.width - 8)),
      top: Math.max(topEdge + 8, Math.min(below + bounds.height <= topEdge + height - 8 ? below : anchor.top - bounds.height - 6, topEdge + height - bounds.height - 8)),
    })
    items.current[term.potential - 1]?.focus({ preventScroll: true })
  }, [open, term.potential])

  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    const moved = (event: Event) => {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    window.addEventListener('resize', moved)
    window.addEventListener('scroll', moved, true)
    window.visualViewport?.addEventListener('resize', moved)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
      window.removeEventListener('resize', moved)
      window.removeEventListener('scroll', moved, true)
      window.visualViewport?.removeEventListener('resize', moved)
    }
  }, [open])

  return <span className={`search-chip operator-search-chip${showPotential ? ' has-potential-control' : ''}`} data-search-label={operatorTermLabel(term)} onClick={event => event.stopPropagation()}>
    <span className="operator-chip-name">{term.name}</span>
    {showPotential ? <button ref={trigger} className="operator-potential-trigger" type="button"
      title={optionLabel(term.potential)}
      aria-label={`${term.name} 최소 잠재: ${optionLabel(term.potential)}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) dismiss(); else { onOpen(); setOpen(true) } }}
      onKeyDown={event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); onOpen(); setOpen(true) }
        if (event.key === 'Escape') { event.preventDefault(); dismiss() }
      }}>
      <span>{label}</span><ChevronDown size={13} aria-hidden="true" />
    </button> : term.potential > 1 ? <span className="operator-potential-value" title={optionLabel(term.potential)} aria-label={optionLabel(term.potential)}>{label}</span> : null}
    <button className="operator-chip-remove" type="button" aria-label={`${operatorTermLabel(term)} 검색 조건 삭제`} onClick={onRemove}><X size={13} /></button>
    {open && showPotential && createPortal(<div id={id} ref={menu} className="operator-potential-menu" role="menu"
      aria-label={`${term.name} 잠재 선택`} style={position}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        const index = items.current.findIndex(item => item === document.activeElement)
        let next: number | undefined
        if (event.key === 'ArrowDown') next = (index + 1) % options.length
        if (event.key === 'ArrowUp') next = (index - 1 + options.length) % options.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = options.length - 1
        if (next !== undefined) { event.preventDefault(); items.current[next]?.focus() }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(true) }
        if (event.key === 'Tab') {
          // Resume tab order from the trigger, not the portal at the end of body.
          trigger.current?.focus()
          setOpen(false)
        }
      }}>
      {options.map((potential, index) => <button key={potential} ref={node => { items.current[index] = node }} type="button"
        role="menuitemradio" aria-checked={term.potential === potential} tabIndex={-1}
        onClick={() => { onChange(potential); dismiss(true) }}>
        <span>{optionLabel(potential)}</span>{term.potential === potential && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>, document.body)}
  </span>
}
