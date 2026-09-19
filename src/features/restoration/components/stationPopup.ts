import type { LatLng } from '../types'

/** Something the popup of a station offers: start its plan, open the one it has. */
export interface StationAction {
  label: string
  primary?: boolean
  run: () => void
}

/** What can be done with a station right now; nothing for someone who may only look. */
export type StationActions = (station: { no: string; at: LatLng }) => StationAction[]

/** The text of a popup (already escaped) with its buttons under it. Without buttons the text goes as it is. */
export function popupContent(html: string, actions: StationAction[], close: () => void): string | HTMLElement {
  if (actions.length === 0) return html
  const content = document.createElement('div')
  content.innerHTML = html
  const bar = document.createElement('div')
  bar.className = 'rc-popup__actions'
  bar.dir = 'rtl'
  for (const action of actions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = action.primary ? 'rc-btn rc-btn--accent' : 'rc-btn'
    button.textContent = action.label
    button.addEventListener('click', () => {
      close()
      action.run()
    })
    bar.append(button)
  }
  content.append(bar)
  return content
}
