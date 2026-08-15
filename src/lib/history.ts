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
