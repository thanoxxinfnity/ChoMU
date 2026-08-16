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
  ssSamplingSteps: 15,
  ssCfgScale: 7.5,
  slatSamplingSteps: 15,
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
 *
 * ss_sampling_steps and slat_sampling_steps are server-validated to
 * [10, 50] inclusive (confirmed against the live endpoint: values below 10
 * are rejected with a `greater_than_equal` 422, above 50 with
 * `less_than_equal`) — "Fast" uses the floor of that range, it can't go
 * lower without NVIDIA rejecting the request outright.
 */
export const SPEED_PRESETS = {
  fast: { label: 'Fast', description: '10 steps — quickest, less refined', ssSamplingSteps: 10, slatSamplingSteps: 10 },
  balanced: { label: 'Balanced', description: '15 steps — default', ssSamplingSteps: 15, slatSamplingSteps: 15 },
  quality: { label: 'Quality', description: '35 steps — slowest, most refined', ssSamplingSteps: 35, slatSamplingSteps: 35 },
} as const

export type SpeedPresetId = keyof typeof SPEED_PRESETS
