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

/**
 * NVIDIA's TRELLIS API has no texture-resolution or "quality" knob (its
 * schema only accepts prompt/image, seed, and these four cfg/sampling-step
 * fields — confirmed by probing the live endpoint, which rejects any other
 * field with `extra_forbidden`). Sampling steps are the one real lever that
 * trades speed for detail: fewer diffusion steps genuinely finishes faster
 * at the cost of geometric/texture refinement, more steps genuinely takes
 * longer and comes out more refined. These presets are honest about that
 * trade-off rather than pretending to control texture pixel resolution,
 * which export-time resizing (see lib/exporters.ts) handles instead.
 */
export const SPEED_PRESETS = {
  fast: { label: 'Fast', description: '~6 steps — quickest, less refined', ssSamplingSteps: 6, slatSamplingSteps: 6 },
  balanced: { label: 'Balanced', description: '~12 steps — default', ssSamplingSteps: 12, slatSamplingSteps: 12 },
  quality: { label: 'Quality', description: '~25 steps — slowest, most refined', ssSamplingSteps: 25, slatSamplingSteps: 25 },
} as const

export type SpeedPresetId = keyof typeof SPEED_PRESETS
