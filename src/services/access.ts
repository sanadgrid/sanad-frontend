// Who may open the dashboard. The decision and its bookkeeping are kept free of
// Firebase so they can be exercised on their own; the two reads they rely on are
// handed in (see accessReads.ts). What this decides is only what the browser
// shows — what anyone may actually read is decided by the database rules.

import type { KeyValueStore } from './cache'

export type Access = { role: 'admin' } | { role: 'member'; sectors: string[] }

export type Verdict =
  | { status: 'granted'; access: Access }
  | { status: 'denied' }
  /** The database could not answer. Never treated as a yes. */
  | { status: 'unverified' }

export interface AccessReads {
  /** Whether `admins/{uid}` exists. */
  isAdmin: (uid: string) => Promise<boolean>
  /** The `sectors` of `members/{uid}`; empty when there is no such document. */
  memberSectors: (uid: string) => Promise<string[]>
}

export const ACCESS_PREFIX = 'sanad.rc.access.'
const accessKey = (uid: string) => `${ACCESS_PREFIX}${uid}`

/** The sector ids in a stored `sectors` field; anything else in there is dropped. */
export const sectorsOf = (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))] : []

/**
 * One read for an admin, two for everybody else. `null` — neither an admin nor
 * a member of any sector. Throws when a read fails: the caller fails closed.
 */
export async function decideAccess(uid: string, reads: AccessReads): Promise<Access | null> {
  if (await reads.isAdmin(uid)) return { role: 'admin' }
  const sectors = sectorsOf(await reads.memberSectors(uid))
  return sectors.length > 0 ? { role: 'member', sectors } : null
}

function parseAccess(json: string | null): Access | null {
  try {
    const value: unknown = JSON.parse(json ?? 'null')
    if (typeof value !== 'object' || value === null || !('role' in value)) return null
    if (value.role === 'admin') return { role: 'admin' }
    const sectors = value.role === 'member' && 'sectors' in value ? sectorsOf(value.sectors) : []
    return sectors.length > 0 ? { role: 'member', sectors } : null
  } catch {
    return null
  }
}

export interface AccessCheck {
  check: (uid: string) => Promise<Verdict>
  /** Sign-out, or access that turned out to be gone: nothing is remembered, here or in the store. */
  forget: () => void
}

/**
 * Only a "yes" is kept in `store` (the session's), under the uid it was given
 * to. A "no" is remembered until the page is closed; a check that failed is not
 * remembered at all, so asking again really asks again. Callers asking about
 * the same user at once share one check.
 */
export function createAccessCheck(reads: AccessReads, store: KeyValueStore | null): AccessCheck {
  const checks = new Map<string, Promise<Verdict>>()

  const remembered = (uid: string): Access | null => {
    try {
      return parseAccess(store?.getItem(accessKey(uid)) ?? null)
    } catch {
      // blocked site data: ask the database
      return null
    }
  }

  const run = async (uid: string): Promise<Verdict> => {
    const saved = remembered(uid)
    if (saved) return { status: 'granted', access: saved }
    try {
      const access = await decideAccess(uid, reads)
      if (!access) return { status: 'denied' }
      try {
        store?.setItem(accessKey(uid), JSON.stringify(access))
      } catch {
        // the answer still holds for this page
      }
      return { status: 'granted', access }
    } catch (error) {
      console.warn('access: could not be verified —', error)
      return { status: 'unverified' }
    }
  }

  return {
    check(uid) {
      const running = checks.get(uid)
      if (running) return running
      const started = run(uid)
      checks.set(uid, started)
      void started.then((verdict) => {
        if (verdict.status === 'unverified' && checks.get(uid) === started) checks.delete(uid)
      })
      return started
    },
    forget() {
      checks.clear()
      try {
        const keys = Array.from({ length: store?.length ?? 0 }, (_, i) => store?.key(i) ?? '')
        for (const key of keys) if (key.startsWith(ACCESS_PREFIX)) store?.removeItem(key)
      } catch {
        // nothing to remove from a store that cannot be reached
      }
    },
  }
}
