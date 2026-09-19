import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '../../../components/Icon'

export interface DataAction {
  id: string
  icon: IconName
  label: string
  /** A quieter second line: what the action touches. */
  hint?: string
  danger?: boolean
  onSelect: () => void
}

interface DataMenuProps {
  actions: DataAction[]
  busy: boolean
}

/** What an admin may do to the sector's data, behind one button of the top bar. */
export function DataMenu({ actions, busy }: DataMenuProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="rc-menu rc-menu--corner" ref={root}>
      <button className="rc-btn" type="button" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>
        <Icon name="database" size={15} />
        إدارة البيانات
        <Icon name="chevronDown" size={14} />
      </button>
      {open && (
        <div className="rc-float rc-menu__list" role="menu">
          {actions.map((action) => (
            <button
              key={action.id}
              className={action.danger ? 'is-danger' : undefined}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                action.onSelect()
              }}
            >
              <Icon name={action.icon} size={16} />
              <span>
                {action.label}
                {action.hint && <small>{action.hint}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
