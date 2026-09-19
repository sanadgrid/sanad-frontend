import { useCallback, useMemo, useState } from 'react'
import type { StationPoint } from './backup/directory'
import { compact, draftOf, pick, type DraftRow, type PlanDraft } from './backup/draft'
import type { BackupCase } from './backup/model'
import type { LatLng } from './types'

/**
 * The plan being written. It lives above the form because the map takes part in
 * it: the draft is drawn while it is typed, and its stations can be clicked on
 * the map instead. Nothing here reads or writes anything — saving is the form's.
 */
export interface PlanEditor {
  /** `null` while no form is open. */
  draft: PlanDraft | null
  isNew: boolean
  /** The form has given way to the map: clicks on stations fill the plan. */
  picking: boolean
  /** Written step by step — the station, its backups, the loads — instead of on the full form. */
  guided: boolean
  /** A place to point out on the map: the option of a duplicate number under the pointer. */
  hover: LatLng | null
  open: (initial?: BackupCase) => void
  /** A new plan, step by step, starting on the map; with `main`, that station is the main element and the backups come next. */
  openGuided: (main?: Pick<DraftRow, 'no' | 'load' | 'at' | 'layerId'>) => void
  /** The plan as it stands moves to the full form. */
  toForm: () => void
  close: () => void
  change: (change: (draft: PlanDraft) => PlanDraft) => void
  startPicking: () => void
  /** Keeps what was picked. */
  finishPicking: () => void
  /** Puts the plan back as it was when picking started. */
  cancelPicking: () => void
  pick: (point: StationPoint) => void
  setHover: (at: LatLng | null) => void
}

interface Editing {
  draft: PlanDraft
  isNew: boolean
  /** The draft as it was when picking started; `null` while the form is on screen. */
  before: PlanDraft | null
  guided: boolean
}

const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `case-${Date.now().toString(36)}`)

export function usePlanEditor(): PlanEditor {
  const [editing, setEditing] = useState<Editing | null>(null)
  const [hover, setHover] = useState<LatLng | null>(null)

  const open = useCallback((initial?: BackupCase) => setEditing({ draft: draftOf(initial, newId()), isNew: !initial, before: null, guided: false }), [])
  const openGuided = useCallback((main?: Pick<DraftRow, 'no' | 'load' | 'at' | 'layerId'>) => {
    const blank = draftOf(undefined, newId())
    const draft = main ? { ...blank, main: { ...blank.main, ...main } } : blank
    // it opens on the map: the next click is the main station, or the first backup
    setEditing({ draft, isNew: true, before: draft, guided: true })
  }, [])
  const toForm = useCallback(() => setEditing((current) => current && { ...current, before: null, guided: false }), [])
  const close = useCallback(() => {
    setEditing(null)
    setHover(null)
  }, [])
  const change = useCallback(
    (apply: (draft: PlanDraft) => PlanDraft) => setEditing((current) => current && { ...current, draft: apply(current.draft) }),
    [],
  )
  const startPicking = useCallback(() => {
    setHover(null)
    setEditing((current) => current && { ...current, draft: compact(current.draft), before: current.draft })
  }, [])
  const finishPicking = useCallback(() => setEditing((current) => current && { ...current, before: null }), [])
  const cancelPicking = useCallback(
    () => setEditing((current) => current && { ...current, draft: current.before ?? current.draft, before: null }),
    [],
  )
  const pickPoint = useCallback(
    (point: StationPoint) => setEditing((current) => (current?.before ? { ...current, draft: pick(current.draft, point) } : current)),
    [],
  )

  return useMemo(
    () => ({
      draft: editing?.draft ?? null,
      isNew: editing?.isNew ?? true,
      picking: Boolean(editing?.before),
      guided: editing?.guided ?? false,
      hover,
      open,
      openGuided,
      toForm,
      close,
      change,
      startPicking,
      finishPicking,
      cancelPicking,
      pick: pickPoint,
      setHover,
    }),
    [editing, hover, open, openGuided, toForm, close, change, startPicking, finishPicking, cancelPicking, pickPoint],
  )
}
