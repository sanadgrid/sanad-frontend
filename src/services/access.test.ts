import { describe, expect, it, vi } from 'vitest'
import { ACCESS_PREFIX, createAccessCheck, decideAccess, sectorsOf, type AccessReads } from './access'
import { isDataKey, layersKey, networkKey, plansKey, sectorsKey, stationsProgressKey, type KeyValueStore } from './cache'

function memoryStore(): KeyValueStore & { dump: () => Record<string, string> } {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    key: (index) => [...items.keys()][index] ?? null,
    get length() {
      return items.size
    },
    dump: () => Object.fromEntries(items),
  }
}

const reads = (admins: string[], members: Record<string, unknown>) => {
  const spy = {
    isAdmin: vi.fn(async (uid: string) => admins.includes(uid)),
    memberSectors: vi.fn(async (uid: string) => sectorsOf(members[uid])),
  }
  return spy satisfies AccessReads
}

const failing: AccessReads = {
  isAdmin: async () => {
    throw Object.assign(new Error('quota'), { code: 'resource-exhausted' })
  },
  memberSectors: async () => [],
}

describe('decideAccess', () => {
  it('lets an admin in with one read', async () => {
    const r = reads(['a'], {})
    expect(await decideAccess('a', r)).toEqual({ role: 'admin' })
    expect(r.memberSectors).not.toHaveBeenCalled()
  })

  it('lets a member in with exactly the sectors they belong to', async () => {
    expect(await decideAccess('m', reads([], { m: ['central', 'western'] }))).toEqual({ role: 'member', sectors: ['central', 'western'] })
  })

  it('refuses a member without sectors', async () => {
    expect(await decideAccess('m', reads([], { m: [] }))).toBeNull()
  })

  it('refuses whoever is neither', async () => {
    expect(await decideAccess('x', reads(['a'], { m: ['central'] }))).toBeNull()
  })

  it('does not take a malformed sectors field for membership', async () => {
    for (const sectors of ['central', { central: true }, [null, 7, ''], undefined])
      expect(await decideAccess('m', reads([], { m: sectors }))).toBeNull()
    expect(sectorsOf(['central', 'central', 3])).toEqual(['central'])
  })

  it('throws when a read fails, so nobody is let in on a guess', async () => {
    await expect(decideAccess('a', failing)).rejects.toThrow()
  })
})

describe('createAccessCheck', () => {
  it('fails closed: a read that fails is "unverified", is not kept, and is asked again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = memoryStore()
    let broken = true
    const r = reads(['a'], {})
    const check = createAccessCheck(
      { ...r, isAdmin: async (uid) => (broken ? Promise.reject(new Error('offline')) : r.isAdmin(uid)) },
      store,
    )
    expect(await check.check('a')).toEqual({ status: 'unverified' })
    expect(store.dump()).toEqual({})
    broken = false
    expect(await check.check('a')).toEqual({ status: 'granted', access: { role: 'admin' } })
  })

  it('keeps a yes for the session, bound to the uid it was given to', async () => {
    const store = memoryStore()
    const r = reads(['a'], {})
    expect((await createAccessCheck(r, store).check('a')).status).toBe('granted')
    expect(Object.keys(store.dump())).toEqual([`${ACCESS_PREFIX}a`])

    // a new page in the same session: no read for the same user …
    const again = reads([], {})
    expect(await createAccessCheck(again, store).check('a')).toEqual({ status: 'granted', access: { role: 'admin' } })
    expect(again.isAdmin).not.toHaveBeenCalled()
    // … and nothing for anybody else
    expect(await createAccessCheck(again, store).check('b')).toEqual({ status: 'denied' })
    expect(again.isAdmin).toHaveBeenCalledWith('b')
  })

  it('keeps a no for the page only, never in the store', async () => {
    const store = memoryStore()
    const r = reads([], {})
    const check = createAccessCheck(r, store)
    expect(await check.check('x')).toEqual({ status: 'denied' })
    expect(await check.check('x')).toEqual({ status: 'denied' })
    expect(r.isAdmin).toHaveBeenCalledTimes(1)
    expect(store.dump()).toEqual({})
    // the next page asks again, and finds the access granted meanwhile
    expect((await createAccessCheck(reads(['x'], {}), store).check('x')).status).toBe('granted')
  })

  it('shares one check between callers asking at once', async () => {
    const r = reads([], { m: ['central'] })
    const check = createAccessCheck(r, memoryStore())
    const [one, two] = await Promise.all([check.check('m'), check.check('m')])
    expect(one).toEqual({ status: 'granted', access: { role: 'member', sectors: ['central'] } })
    expect(two).toBe(one)
    expect(r.isAdmin).toHaveBeenCalledTimes(1)
    expect(r.memberSectors).toHaveBeenCalledTimes(1)
  })

  it('forgets everything on sign-out, and leaves other keys alone', async () => {
    const store = memoryStore()
    store.setItem('sanad.rc.theme', 'dark')
    const r = reads(['a'], {})
    const check = createAccessCheck(r, store)
    await check.check('a')
    check.forget()
    expect(store.dump()).toEqual({ 'sanad.rc.theme': 'dark' })
    await check.check('a')
    expect(r.isAdmin).toHaveBeenCalledTimes(2)
  })

  it('does not trust a stored value that is not a grant', async () => {
    const store = memoryStore()
    for (const junk of ['1', 'true', '{"role":"member","sectors":[]}', '{"role":"owner"}', 'not json']) {
      store.setItem(`${ACCESS_PREFIX}x`, junk)
      expect(await createAccessCheck(reads([], {}), store).check('x')).toEqual({ status: 'denied' })
    }
  })

  it('works without a store', async () => {
    expect((await createAccessCheck(reads(['a'], {}), null).check('a')).status).toBe('granted')
  })
})

describe('isDataKey', () => {
  it('covers everything read from the database, and what older releases saved', () => {
    const keys = [networkKey('central'), sectorsKey(), layersKey('central'), stationsProgressKey('central'), plansKey('central')]
    const legacy = ['sanad.rc.network.central.public', 'sanad.rc.network.central.member', 'sanad.rc.sectors.public']
    for (const key of [...keys, ...legacy]) expect(isDataKey(key), key).toBe(true)
  })

  it('leaves preferences and other sites’ keys alone', () => {
    for (const key of ['sanad.rc.theme', 'sanad.rc.basemap', 'sanad.rc.networks', 'other.network.central']) expect(isDataKey(key), key).toBe(false)
  })
})
