const SLUG_LENGTH = 40

/** Latin letters and digits only: Arabic names are told apart by the hash. */
const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_LENGTH)
    .replace(/-+$/, '') || 'layer'

/** FNV-1a, 32 bits, in base 36 — short, stable, and good enough to tell folder paths apart. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, 0x01000193)
  return (hash >>> 0).toString(36)
}

/** The same folder of the same sector always maps to the same id, so importing it again replaces it. */
export const layerIdOf = (sectorId: string, name: string, path: string) =>
  `${sectorId}-${slugOf(name)}-${shortHash(path)}`
