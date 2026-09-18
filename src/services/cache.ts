// What was read from the database is kept in the browser, so opening the page
// again costs nothing for ten minutes and one small read after that. No Firebase
// in here: the rules of the cache can be exercised on their own.

export const FRESH_MS = 10 * 60_000
// the browser gives a site about 5 MB in total; one entry may not take most of it
export const MAX_ENTRY_CHARS = 2_000_000
export const CACHE_PREFIX = 'sanad.rc.'

export interface CacheEntry<T> {
  /** When the value was last confirmed to match the database, ms since the epoch. */
  savedAt: number
  /** Who read it; `null` for a visitor. An entry is never served to anyone else. */
  uid: string | null
  value: T
}

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export interface Cache {
  get: <T>(key: string, uid: string | null) => CacheEntry<T> | null
  set: <T>(key: string, uid: string | null, value: T) => void
  /** The value was checked and still holds: its ten minutes start again. */
  touch: (key: string) => void
  remove: (key: string) => void
  /** Drops every entry whose key is matched. */
  clear: (matches: (key: string) => boolean) => void
  isFresh: (entry: CacheEntry<unknown>) => boolean
}

/**
 * Entries live in memory and, when the store takes them, in the store as well.
 * A store that is missing, full or blocked only costs the second layer — every
 * access to it is allowed to fail.
 */
export function createCache(store: KeyValueStore | null, now: () => number = Date.now): Cache {
  const memory = new Map<string, CacheEntry<unknown>>()

  const stored = (key: string): CacheEntry<unknown> | null => {
    try {
      const entry: unknown = JSON.parse(store?.getItem(key) ?? 'null')
      const valid =
        typeof entry === 'object' && entry !== null && 'savedAt' in entry && typeof entry.savedAt === 'number' && 'value' in entry
      return valid ? (entry as CacheEntry<unknown>) : null
    } catch {
      return null
    }
  }

  const persist = (key: string, entry: CacheEntry<unknown>) => {
    try {
      const json = JSON.stringify(entry)
      if (json.length > MAX_ENTRY_CHARS) store?.removeItem(key)
      else store?.setItem(key, json)
    } catch {
      // full or blocked: the entry stays in memory only
    }
  }

  const remove = (key: string) => {
    memory.delete(key)
    try {
      store?.removeItem(key)
    } catch {
      // nothing to remove from a store that cannot be reached
    }
  }

  return {
    get<T>(key: string, uid: string | null) {
      const entry = memory.get(key) ?? stored(key)
      if (!entry || (entry.uid ?? null) !== uid) return null
      memory.set(key, entry)
      return entry as CacheEntry<T>
    },
    set(key, uid, value) {
      const entry = { savedAt: now(), uid, value }
      memory.set(key, entry)
      persist(key, entry)
    },
    touch(key) {
      const entry = memory.get(key) ?? stored(key)
      if (!entry) return
      const touched = { ...entry, savedAt: now() }
      memory.set(key, touched)
      persist(key, touched)
    },
    remove,
    clear(matches) {
      const keys = [...memory.keys()]
      try {
        for (let i = 0; i < (store?.length ?? 0); i += 1) keys.push(store?.key(i) ?? '')
      } catch {
        // only what is in memory can be listed
      }
      for (const key of new Set(keys)) if (matches(key)) remove(key)
    },
    // a clock set back must not keep an entry fresh for ever
    isFresh: (entry) => entry.savedAt <= now() && now() - entry.savedAt < FRESH_MS,
  }
}

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // private windows and blocked site data throw on access
    return null
  }
}

export const cache = createCache(browserStore())

export type CacheScope = 'public' | 'member'
export const scopeOf = (uid: string | null): CacheScope => (uid ? 'member' : 'public')

export const networkKey = (sectorId: string, scope: CacheScope) => `${CACHE_PREFIX}network.${sectorId}.${scope}`
export const sectorsKey = (scope: CacheScope) => `${CACHE_PREFIX}sectors.${scope}`
// imported layers are only ever listed for a signed-in user
export const layersKey = (sectorId: string) => `${CACHE_PREFIX}layers.${sectorId}`

const isMemberKey = (key: string) =>
  key.startsWith(CACHE_PREFIX) && (key.endsWith('.member') || key.startsWith(`${CACHE_PREFIX}layers.`))

/** What a signed-in user read does not stay on the device after they leave; a visitor's entries hold public data only. */
export const clearMemberCache = () => cache.clear(isMemberKey)
