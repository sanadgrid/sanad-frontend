import { ImportError, type XmlParser } from './types'

// Google Earth exports files that use a prefix (typically `xsi:`) without ever
// declaring it. A strict XML parser refuses the whole document, so the missing
// declarations are added to the root element and the parse is tried once more.
const KNOWN_NAMESPACES: Record<string, string> = {
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
  gx: 'http://www.google.com/kml/ext/2.2',
  kml: 'http://www.opengis.net/kml/2.2',
  atom: 'http://www.w3.org/2005/Atom',
  xal: 'urn:oasis:names:tc:ciq:xsdschema:xAL:2.0',
}

function tryParse(text: string, parser: XmlParser): Document | null {
  try {
    const doc = parser.parseFromString(text, 'application/xml')
    // browsers do not throw: they return a document that holds a <parsererror>
    if (!doc?.documentElement || doc.getElementsByTagName('parsererror').length > 0) return null
    return doc
  } catch {
    return null
  }
}

function undeclaredPrefixes(text: string): string[] {
  const declared = new Set(['xml', 'xmlns'])
  for (const match of text.matchAll(/\sxmlns:([\w.-]+)\s*=/g)) declared.add(match[1])

  const used = new Set<string>()
  for (const match of text.matchAll(/<\/?([A-Za-z_][\w.-]*):[A-Za-z_]/g)) used.add(match[1])
  for (const tag of text.matchAll(/<[A-Za-z_][^<>]*>/g))
    for (const attribute of tag[0].matchAll(/\s([A-Za-z_][\w.-]*):[\w.-]+\s*=/g)) used.add(attribute[1])

  return [...used].filter((prefix) => !declared.has(prefix))
}

function declare(text: string, prefixes: string[]): string {
  const declarations = prefixes.map((p) => `xmlns:${p}="${KNOWN_NAMESPACES[p] ?? `urn:undeclared:${p}`}"`).join(' ')
  // the first tag that opens with a letter is the root: `<?xml` and `<!--` do not
  return text.replace(/<[A-Za-z_][\w.:-]*/, (root) => `${root} ${declarations}`)
}

export function parseXml(text: string, parser: XmlParser): Document {
  const doc = tryParse(text, parser)
  if (doc) return doc

  const missing = undeclaredPrefixes(text)
  const repaired = missing.length > 0 ? tryParse(declare(text, missing), parser) : null
  if (!repaired) throw new ImportError('unreadable')
  return repaired
}
