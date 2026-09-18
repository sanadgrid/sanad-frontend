import { unzipSync } from 'fflate'
import { ImportError } from './types'

const isKml = (name: string) => /\.kml$/i.test(name)
// a zip archive starts with "PK\x03\x04", whatever the file is called
const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04

function decode(bytes: Uint8Array): string {
  // the XML declaration is ASCII in every encoding a KML file is likely to use
  const head = String.fromCharCode(...bytes.subarray(0, 200))
  const label = /encoding\s*=\s*["']([\w-]+)["']/i.exec(head)?.[1] ?? 'utf-8'
  try {
    return new TextDecoder(label).decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

/** The KML text of a `.kml` file, or of the main document inside a `.kmz` archive. */
export function kmlTextOf(fileName: string, bytes: Uint8Array): string {
  if (!/\.(kmz|kml)$/i.test(fileName)) throw new ImportError('unsupported')
  if (!isZip(bytes)) return decode(bytes)

  let entries: Record<string, Uint8Array>
  try {
    // only the KML entries are inflated: icons and 3D models stay compressed
    entries = unzipSync(bytes, { filter: (entry) => isKml(entry.name) })
  } catch (error) {
    throw new ImportError('unreadable', error)
  }
  const names = Object.keys(entries)
  // Google Earth writes the main document as doc.kml at the root of the archive
  const main = names.find((name) => name.toLowerCase() === 'doc.kml') ?? names[0]
  if (!main) throw new ImportError('unreadable')
  return decode(entries[main])
}
