// Basemap source. CARTO's keyless dark tiles now come watermarked "API KEY
// REQUIRED", so the default is the standard OpenStreetMap layer, darkened in CSS
// to match the theme. Set VITE_MAP_TILE_URL (and its attribution) to switch to a
// provider you hold a key for — e.g. CARTO dark_all — without touching the code.

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const customUrl = import.meta.env.VITE_MAP_TILE_URL

export const mapTiles = {
  url: customUrl || OSM_URL,
  attribution: (customUrl && import.meta.env.VITE_MAP_TILE_ATTRIBUTION) || OSM_ATTRIBUTION,
  /** Light tiles are inverted into a dark basemap; a custom source is shown as it is. */
  darken: !customUrl,
  /** The OSM tile servers do not serve zoom levels above 19. */
  maxNativeZoom: 19,
}
