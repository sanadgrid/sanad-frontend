import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Icon, type IconName } from '../../../components/Icon'

interface AddPlanButtonProps {
  /** There are stations on the map to click: without any, the map is not a way in. */
  canPick: boolean
  onPick: () => void
  onManual: () => void
  onBulk: () => void
}

interface Way {
  id: string
  icon: IconName
  label: string
  hint: string
  disabled?: boolean
  onSelect: () => void
}

/** The way into a new plan, always on the map for whoever may add one: a pill on a wide screen, a round button on a phone. */
export function AddPlanButton({ canPick, onPick, onManual, onBulk }: AddPlanButtonProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const ways: Way[] = [
    {
      id: 'pick',
      icon: 'crosshair',
      label: 'اختر من الخريطة',
      hint: canPick ? 'اضغط على المحطة الرئيسية ثم بدائلها' : 'لا توجد محطات على الخريطة بعد — استورد طبقات الخريطة أولاً',
      disabled: !canPick,
      onSelect: onPick,
    },
    { id: 'manual', icon: 'edit', label: 'إدخال يدوي', hint: 'اكتب أرقام المحطات وأحمالها', onSelect: onManual },
    { id: 'bulk', icon: 'table', label: 'إدخال جماعي من Excel', hint: 'خطط كثيرة دفعة واحدة من جدول', onSelect: onBulk },
  ]

  useEffect(() => {
    if (!open) return
    // the first way that can be taken is under Enter as soon as the menu opens
    list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setOpen(false)
      root.current?.querySelector<HTMLButtonElement>('.rc-addplan__button')?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div className="rc-addplan rc-menu" ref={root} onKeyDown={onKey}>
      <button className="rc-addplan__button" type="button" aria-haspopup="menu" aria-expanded={open} aria-label="إضافة خطة" onClick={() => setOpen(!open)}>
        <Icon name="plus" size={18} />
        <span>إضافة خطة</span>
      </button>
      {open && (
        <div className="rc-float rc-menu__list rc-addplan__list" role="menu" ref={list}>
          {ways.map((way, i) => (
            <button
              key={way.id}
              className={i === 0 ? 'is-primary' : undefined}
              type="button"
              role="menuitem"
              disabled={way.disabled}
              onClick={() => {
                setOpen(false)
                way.onSelect()
              }}
            >
              <Icon name={way.icon} size={16} />
              <span>
                {way.label}
                <small>{way.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
