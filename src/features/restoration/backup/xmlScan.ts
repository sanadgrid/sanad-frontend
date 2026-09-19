// A forward scan over XML text: opening tags, closing tags and the text between
// them, names without their prefix. Just what a spreadsheet's parts need — it
// runs anywhere and keeps a sheet of thousands of rows out of a document tree. Pure.

export interface XmlHandler {
  open?: (name: string, attributes: Record<string, string>) => void
  close?: (name: string) => void
  text?: (text: string) => void
}

const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const codePoint = (code: number, fallback: string) => {
  try {
    return String.fromCodePoint(code)
  } catch {
    return fallback
  }
}

export const decodeEntities = (text: string) =>
  text.includes('&')
    ? text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) => {
        if (name[0] !== '#') return NAMED[name] ?? whole
        return codePoint(name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1)), whole)
      })
    : text

const localName = (name: string) => name.slice(name.indexOf(':') + 1)

/** Where the tag that opens at `from` ends; a `>` inside a quoted value does not end it. */
function tagEnd(xml: string, from: number): number {
  let quote = ''
  for (let i = from; i < xml.length; i += 1) {
    const c = xml[i]
    if (quote) {
      if (c === quote) quote = ''
    } else if (c === '"' || c === "'") quote = c
    else if (c === '>') return i
  }
  return -1
}

/** Attribute names keep their prefix: `r:id` and `id` are different things. */
function attributesOf(tag: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of tag.matchAll(/([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attributes[match[1]] = decodeEntities(match[2] ?? match[3])
  return attributes
}

/** Throws on a document that breaks off in the middle of a tag. */
export function scanXml(xml: string, handler: XmlHandler): void {
  let at = 0
  while (at < xml.length) {
    const open = xml.indexOf('<', at)
    if (open < 0) break
    if (open > at) handler.text?.(decodeEntities(xml.slice(at, open)))

    const skip = (start: string, end: string): boolean => {
      if (!xml.startsWith(start, open)) return false
      const close = xml.indexOf(end, open + start.length)
      if (close < 0) throw new Error('xml: unterminated section')
      if (start === '<![CDATA[') handler.text?.(xml.slice(open + start.length, close))
      at = close + end.length
      return true
    }
    if (skip('<!--', '-->') || skip('<![CDATA[', ']]>') || skip('<?', '?>')) continue

    const end = tagEnd(xml, open)
    if (end < 0) throw new Error('xml: unterminated tag')
    at = end + 1
    if (xml[open + 1] === '!') continue
    if (xml[open + 1] === '/') {
      handler.close?.(localName(xml.slice(open + 2, end).trim()))
      continue
    }
    const selfClosing = xml[end - 1] === '/'
    const tag = xml.slice(open + 1, selfClosing ? end - 1 : end)
    const written = /^[^\s/]+/.exec(tag)?.[0] ?? ''
    const name = localName(written)
    handler.open?.(name, tag.length > written.length ? attributesOf(tag.slice(written.length)) : {})
    if (selfClosing) handler.close?.(name)
  }
}
