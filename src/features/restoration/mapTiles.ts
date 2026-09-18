// Basemap source. CARTO's keyless tiles now come watermarked "API KEY REQUIRED",
// so the default is the standard OpenStreetMap layer, filtered in CSS to suit the
// dashboard's theme. Set VITE_MAP_TILE_URL (and its attribution) to switch to a
// provider you hold a key for — e.g. CARTO — without touching the code.

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
// The credit is a condition of using the tiles: it stays visible, and its link carries the full notice.
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'

const customUrl = import.meta.env.VITE_MAP_TILE_URL

export const mapTiles = {
  url: customUrl || OSM_URL,
  attribution: (customUrl && import.meta.env.VITE_MAP_TILE_ATTRIBUTION) || OSM_ATTRIBUTION,
  /** OSM tiles are calmed (light theme) or inverted (dark theme) by the stylesheet; a custom source is shown as it is. */
  themed: !customUrl,
  /** The OSM tile servers do not serve zoom levels above 19. */
  maxNativeZoom: 19,
}
