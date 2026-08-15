export type GenerationMode = 'text' | 'image'

export type GenerationStatus = 'pending' | 'success' | 'error'

export interface GenerationParams {
  seed?: number
  ssSamplingSteps?: number
  ssCfgScale?: number
  slatSamplingSteps?: number
  slatCfgScale?: number
}

export interface GenerationRecord {
  id: string
  mode: GenerationMode
  prompt?: string
  sourceImage?: string // data URL thumbnail of the uploaded image
  status: GenerationStatus
  createdAt: number
  finishedAt?: number
  seed?: number
  params: GenerationParams
  glbBlob?: Blob
  thumbnail?: string // data URL rendered from the model, filled in by the viewer
  error?: string
}

export interface ChomuSettings {
  apiKey: string
  theme: 'light' | 'dark' | 'system'
}

export const DEFAULT_PARAMS: Required<GenerationParams> = {
  seed: 0,
  ssSamplingSteps: 12,
  ssCfgScale: 7.5,
  slatSamplingSteps: 12,
  slatCfgScale: 3,
}
