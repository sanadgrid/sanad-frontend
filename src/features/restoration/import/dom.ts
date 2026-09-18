// The few DOM reads the importer needs, limited to what every XML DOM offers
// (`childNodes`, `nodeType`, `textContent`) so the parser also runs outside a browser.

const ELEMENT_NODE = 1

/** The tag name without its namespace prefix: `gx:Track` → `Track`. */
export const localNameOf = (element: Element) => (element.localName || element.nodeName).replace(/^.*:/, '')

/** Direct child elements, optionally only those with the given tag name. */
export function childrenOf(parent: Element, name?: string): Element[] {
  const found: Element[] = []
  for (let node = parent.firstChild; node; node = node.nextSibling)
    if (node.nodeType === ELEMENT_NODE && (!name || localNameOf(node as Element) === name)) found.push(node as Element)
  return found
}

export const firstChild = (parent: Element, name: string): Element | undefined => childrenOf(parent, name)[0]

export const textOf = (element: Element | undefined) => element?.textContent?.trim() ?? ''
