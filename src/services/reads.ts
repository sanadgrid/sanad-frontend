import { getDocsFromServer, type DocumentData, type Query, type QuerySnapshot } from 'firebase/firestore'

// A blocked or offline Firestore can keep a read pending for a long time —
// the page should fall back to what it has instead of spinning.
const READ_TIMEOUT_MS = 8000
const DEV_REPORT_MS = 1500

// "The database cannot answer right now" — the daily quota is spent, the network
// is down, or the read timed out. Unlike a refusal or a missing document, the
// data is still there, so whatever was saved earlier stays valid.
const UNREACHABLE_CODES = ['resource-exhausted', 'unavailable', 'deadline-exceeded']

const codeOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''

export const isUnreachable = (error: unknown) => UNREACHABLE_CODES.includes(codeOf(error))
export const isDenied = (error: unknown) => codeOf(error) === 'permission-denied'

export function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error('Firestore read timed out'), { code: 'deadline-exceeded' })),
        READ_TIMEOUT_MS,
      ),
    ),
  ])
}

const inFlight = new Map<string, Promise<unknown>>()

/**
 * Callers asking for the same thing while it is on its way share one read — a
 * sign-in settling, or an effect run twice, must not double the cost of a page.
 */
export function shared<T>(key: string, start: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key) as Promise<T> | undefined
  if (running) return running
  const started = start().finally(() => inFlight.delete(key))
  inFlight.set(key, started)
  return started
}

const counted = new Map<string, number>()
let reportTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Development only: documents read since the page loaded, printed to the console
 * once the reads settle. The free tier allows 50,000 a day, and a careless loop
 * can spend that in an afternoon — this keeps the cost of a page load in sight.
 */
export function countReads(what: string, documents: number) {
  if (!import.meta.env.DEV) return
  counted.set(what, (counted.get(what) ?? 0) + documents)
  clearTimeout(reportTimer)
  reportTimer = setTimeout(() => {
    const total = [...counted.values()].reduce((sum, n) => sum + n, 0)
    console.info(`[reads] ${total} documents read since the page loaded`, Object.fromEntries(counted))
  }, DEV_REPORT_MS)
}

/**
 * A query answered by the server or not at all. The plain `getDocs` answers from
 * its empty local cache when the server is unreachable, and "nothing there" would
 * then be indistinguishable from "could not ask".
 */
export async function serverDocs(what: string, q: Query): Promise<QuerySnapshot<DocumentData>> {
  const snap = await getDocsFromServer(q)
  // a query without results is still billed as one read
  countReads(what, Math.max(1, snap.size))
  return snap
}
