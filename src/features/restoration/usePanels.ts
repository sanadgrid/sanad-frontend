import { useState, type RefObject } from 'react'
import type { MapView } from './components/mapView'
import { useMediaQuery, WIDE_SCREEN } from './useMediaQuery'
import { useRoom } from './useRoom'

// the clear area under which the open legend would crowd the map
const LEGEND_ROOM = { width: 720, height: 460 }

/**
 * The map is the page: every panel over it can be folded away. This holds which
 * are open and the view last asked of the map; `clearArea` is the part of the
 * map none of them covers. On a phone the table is part of the page below the
 * map, so it starts open there.
 */
export function usePanels(clearArea: RefObject<HTMLElement | null>) {
  const wide = useMediaQuery(WIDE_SCREEN)
  const [kpisOpen, setKpisOpen] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(!wide)
  // the legend yields when the panels leave it little room, until the user decides otherwise
  const [legendChoice, setLegendChoice] = useState<boolean | null>(null)
  // a fresh object every time, so asking for the same view twice moves the map twice
  const [view, setView] = useState<MapView | null>(null)
  // open by itself only where the map is fitted around the panels; on a scrolling page it would sit on stations
  const roomy = useRoom(clearArea, LEGEND_ROOM.width, LEGEND_ROOM.height)
  const legendOpen = roomy && wide ? (legendChoice ?? true) : legendChoice === true

  return {
    wide,
    kpisOpen,
    toggleKpis: () => setKpisOpen((open) => !open),
    filtersOpen,
    setFiltersOpen,
    plansOpen,
    setPlansOpen,
    sheetOpen,
    toggleSheet: () => setSheetOpen((open) => !open),
    legendOpen,
    toggleLegend: () => setLegendChoice(!legendOpen),
    view,
    setView,
  }
}
