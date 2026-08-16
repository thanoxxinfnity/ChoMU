import { get, set, del, keys, createStore } from 'idb-keyval'
import type { GenerationRecord } from './types'

const store = createStore('chomu-db', 'generations')

export async function saveGeneration(record: GenerationRecord): Promise<void> {
  await set(record.id, record, store)
}

export async function updateGeneration(id: string, patch: Partial<GenerationRecord>): Promise<void> {
  const existing = await get<GenerationRecord>(id, store)
  if (!existing) return
  await set(id, { ...existing, ...patch }, store)
}

export async function deleteGeneration(id: string): Promise<void> {
  await del(id, store)
}

export async function getGeneration(id: string): Promise<GenerationRecord | undefined> {
  return get<GenerationRecord>(id, store)
}

export async function listGenerations(): Promise<GenerationRecord[]> {
  const allKeys = await keys(store)
  const records = await Promise.all(allKeys.map((k) => get<GenerationRecord>(k, store)))
  return records
    .filter((r): r is GenerationRecord => !!r)
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function newGenerationId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * A generation stays "pending" only while its JS promise chain is alive. If
 * Android suspends or kills the WebView while ChoMU is backgrounded during
 * the request (common on aggressive-battery-optimization OEM skins), that
 * chain never resumes and the record is stuck "pending" forever with no
 * error, no retry, nothing — even though the network request itself is long
 * dead. There's no way to recover the original request from here, so this
 * sweeps any "pending" record older than the longest a real attempt could
 * legitimately still be running (3 retries x ~90s cold-start + generation
 * time, generously rounded up) and marks it a clear, actionable error
 * instead of leaving it stuck. Runs once per app load.
 */
const STALE_PENDING_MS = 8 * 60 * 1000

export async function reconcileStalePending(): Promise<void> {
  const all = await listGenerations()
  const cutoff = Date.now() - STALE_PENDING_MS
  const stale = all.filter((r) => r.status === 'pending' && r.createdAt < cutoff)
  await Promise.all(
    stale.map((r) =>
      updateGeneration(r.id, {
        status: 'error',
        finishedAt: Date.now(),
        error:
          'This generation never got a response and timed out. It likely stopped because the app was closed, backgrounded, or paused by the OS while waiting on NVIDIA — keep ChoMU in the foreground while generating. Try again.',
      }),
    ),
  )
}
