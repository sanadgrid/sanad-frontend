const MAX_LENGTH = 600

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decodeEntity(entity: string, body: string): string {
  if (body[0] !== '#') return ENTITIES[body.toLowerCase()] ?? entity
  const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
}

/**
 * Google Earth descriptions are HTML fragments (tables, links, inline styles).
 * Only their text is kept — nothing from the file is ever rendered as markup.
 */
export function plainText(html: string): string {
  const text = html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // a tag always separates words: "<td>a</td><td>b</td>" must not read "ab"
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, decodeEntity)
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1).trimEnd()}…` : text
}
