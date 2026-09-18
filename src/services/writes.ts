import { writeBatch, type DocumentData, type DocumentReference } from 'firebase/firestore'
import { db } from '../lib/firebase'

// A commit takes at most 500 writes and 10 MiB; stay clear of both.
const BATCH_OPS = 400
const BATCH_BYTES = 8_000_000
/** Field names, ids and the fixed fields of a write, generously. */
export const WRITE_OVERHEAD_BYTES = 2_000

export interface Write {
  ref: DocumentReference
  /** `null` deletes the document. */
  data: DocumentData | null
  bytes: number
}

/** Commits the writes in order, in as few batches as the limits allow. */
export async function commit(writes: Write[], onCommitted: (count: number) => void = () => {}) {
  let start = 0
  while (start < writes.length) {
    const batch = writeBatch(db)
    let end = start
    let bytes = 0
    while (end < writes.length && end - start < BATCH_OPS && (end === start || bytes + writes[end].bytes <= BATCH_BYTES)) {
      const { ref, data } = writes[end]
      if (data) batch.set(ref, data)
      else batch.delete(ref)
      bytes += writes[end].bytes
      end += 1
    }
    await batch.commit()
    onCommitted(end - start)
    start = end
  }
}
