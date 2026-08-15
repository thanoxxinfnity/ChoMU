import { create } from 'zustand'
import { generateFromText, generateFromImage, NvidiaApiError } from './nvidia'
import { getApiKey } from './storage'
import { saveGeneration, newGenerationId } from './history'
import type { GenerationParams, GenerationRecord } from './types'

export interface QueueItem {
  id: string
  historyId: string
  mode: 'text' | 'image'
  prompt?: string
  imageBlob?: Blob
  imagePreview?: string
  params: GenerationParams
  status: 'queued' | 'generating' | 'warming-up' | 'done' | 'error'
  error?: string
  glbUrl?: string
  seed?: number
}

interface QueueState {
  items: QueueItem[]
  processing: boolean
  enqueueText: (prompts: string[], params: GenerationParams) => Promise<void>
  enqueueImage: (image: File, params: GenerationParams) => Promise<void>
  clearFinished: () => void
  removeItem: (id: string) => void
  _process: () => Promise<void>
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  processing: false,

  enqueueText: async (prompts, params) => {
    const newItems: QueueItem[] = []
    for (const raw of prompts) {
      const prompt = raw.trim()
      if (!prompt) continue
      const historyId = newGenerationId()
      const record: GenerationRecord = {
        id: historyId,
        mode: 'text',
        prompt,
        status: 'pending',
        createdAt: Date.now(),
        params,
      }
      await saveGeneration(record)
      newItems.push({
        id: `q_${historyId}`,
        historyId,
        mode: 'text',
        prompt,
        params,
        status: 'queued',
      })
    }
    set((s) => ({ items: [...s.items, ...newItems] }))
    get()._process()
  },

  enqueueImage: async (image, params) => {
    const historyId = newGenerationId()
    const preview = URL.createObjectURL(image)
    const record: GenerationRecord = {
      id: historyId,
      mode: 'image',
      sourceImage: preview,
      status: 'pending',
      createdAt: Date.now(),
      params,
    }
    await saveGeneration(record)
    const item: QueueItem = {
      id: `q_${historyId}`,
      historyId,
      mode: 'image',
      imageBlob: image,
      imagePreview: preview,
      params,
      status: 'queued',
    }
    set((s) => ({ items: [...s.items, item] }))
    get()._process()
  },

  clearFinished: () => set((s) => ({ items: s.items.filter((i) => i.status === 'queued' || i.status === 'generating' || i.status === 'warming-up') })),

  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),

  _process: async () => {
    if (get().processing) return
    const next = get().items.find((i) => i.status === 'queued')
    if (!next) return

    set({ processing: true })
    set((s) => ({ items: s.items.map((i) => (i.id === next.id ? { ...i, status: 'generating' } : i)) }))

    const save = saveGeneration
    const apiKey = await getApiKey()
    if (!apiKey.trim()) {
      set((s) => ({
        items: s.items.map((i) => (i.id === next.id ? { ...i, status: 'error', error: 'No API key set in Settings.' } : i)),
      }))
      await save({
        id: next.historyId,
        mode: next.mode,
        prompt: next.prompt,
        sourceImage: next.imagePreview,
        status: 'error',
        createdAt: Date.now(),
        params: next.params,
        error: 'No API key set in Settings.',
      })
      set({ processing: false })
      get()._process()
      return
    }

    const onRetry = () =>
      set((s) => ({ items: s.items.map((i) => (i.id === next.id ? { ...i, status: 'warming-up' } : i)) }))

    try {
      const result =
        next.mode === 'text'
          ? await generateFromText(apiKey, next.prompt!, next.params, onRetry)
          : await generateFromImage(apiKey, next.imageBlob!, next.params, onRetry)

      const url = URL.createObjectURL(result.glb)
      set((s) => ({
        items: s.items.map((i) => (i.id === next.id ? { ...i, status: 'done', glbUrl: url, seed: result.seed } : i)),
      }))
      await save({
        id: next.historyId,
        mode: next.mode,
        prompt: next.prompt,
        sourceImage: next.imagePreview,
        status: 'success',
        createdAt: Date.now(),
        finishedAt: Date.now(),
        seed: result.seed,
        glbBlob: result.glb,
        params: next.params,
      })
    } catch (e) {
      const err = e as NvidiaApiError
      set((s) => ({ items: s.items.map((i) => (i.id === next.id ? { ...i, status: 'error', error: err.message } : i)) }))
      await save({
        id: next.historyId,
        mode: next.mode,
        prompt: next.prompt,
        sourceImage: next.imagePreview,
        status: 'error',
        createdAt: Date.now(),
        finishedAt: Date.now(),
        error: err.message,
        params: next.params,
      })
    }

    set({ processing: false })
    get()._process()
  },
}))
