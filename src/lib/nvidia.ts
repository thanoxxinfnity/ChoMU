import { apiRequest, base64ToBlob } from './http'
import type { GenerationParams } from './types'

const TRELLIS_URL = 'https://ai.api.nvidia.com/v1/genai/microsoft/trellis'
const ASSETS_URL = 'https://api.nvcf.nvidia.com/v2/nvcf/assets'

export class NvidiaApiError extends Error {
  status?: number
  code?: 'INVALID_KEY' | 'IMAGE_UPLOAD_UNSUPPORTED' | 'BAD_REQUEST' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'UNKNOWN'
  constructor(message: string, opts: { status?: number; code?: NvidiaApiError['code'] } = {}) {
    super(message)
    this.name = 'NvidiaApiError'
    this.status = opts.status
    this.code = opts.code
  }
}

function authHeaders(apiKey: string, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  }
}

/** Cheap key validation: NVIDIA rejects auth before body validation, so an
 *  empty payload distinguishes "bad key" (401/403) from "reached the model"
 *  (422 body-validation error) without paying for a real generation. */
export async function testApiKey(apiKey: string): Promise<{ ok: boolean; message: string }> {
  if (!apiKey.trim()) return { ok: false, message: 'API key is empty.' }
  try {
    const res = await apiRequest({
      url: TRELLIS_URL,
      method: 'POST',
      headers: authHeaders(apiKey),
      data: {},
      timeoutMs: 20_000,
    })
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Key rejected by NVIDIA (401/403 — invalid or expired API key).' }
    }
    if (res.status === 422) {
      return { ok: true, message: 'Key is valid — NVIDIA authenticated the request and reached the TRELLIS model.' }
    }
    if (res.status === 429) {
      return { ok: true, message: 'Key is valid, but you are currently rate-limited by NVIDIA.' }
    }
    return { ok: false, message: `Unexpected response (HTTP ${res.status}). Key status unclear.` }
  } catch (e) {
    return { ok: false, message: `Network error while testing key: ${(e as Error).message}` }
  }
}

function paramsToPayload(params: GenerationParams) {
  const p: Record<string, number> = {}
  if (params.seed !== undefined) p.seed = params.seed
  if (params.ssSamplingSteps !== undefined) p.ss_sampling_steps = params.ssSamplingSteps
  if (params.ssCfgScale !== undefined) p.ss_cfg_scale = params.ssCfgScale
  if (params.slatSamplingSteps !== undefined) p.slat_sampling_steps = params.slatSamplingSteps
  if (params.slatCfgScale !== undefined) p.slat_cfg_scale = params.slatCfgScale
  return p
}

interface TrellisArtifact {
  base64: string
  finishReason: string
  seed: number
}
interface TrellisResponse {
  artifacts: TrellisArtifact[]
}

function handleErrorResponse(status: number, data: unknown): never {
  const detail = typeof data === 'object' && data && 'detail' in data ? (data as { detail: unknown }).detail : data

  if (status === 401 || status === 403) {
    throw new NvidiaApiError('Invalid or expired NVIDIA API key. Update it in Settings.', {
      status,
      code: 'INVALID_KEY',
    })
  }
  if (status === 429) {
    throw new NvidiaApiError('Rate limited by NVIDIA. Wait a moment and try again.', { status, code: 'RATE_LIMITED' })
  }
  if (status === 422) {
    const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail)
    if (detailStr.includes('example_id')) {
      throw new NvidiaApiError(
        'NVIDIA’s hosted TRELLIS endpoint is currently rejecting uploaded images for image-to-3D (it only accepts its own preset "example_id" gallery images right now). This is a known limitation on NVIDIA’s side, not a ChoMU bug — try Text-to-3D, or retry image-to-3D later once NVIDIA re-enables custom image uploads.',
        { status, code: 'IMAGE_UPLOAD_UNSUPPORTED' },
      )
    }
    throw new NvidiaApiError(`NVIDIA rejected the request: ${detailStr}`, { status, code: 'BAD_REQUEST' })
  }
  if (status >= 500) {
    throw new NvidiaApiError('NVIDIA TRELLIS service error. Try again shortly.', { status, code: 'SERVER_ERROR' })
  }
  throw new NvidiaApiError(`Unexpected NVIDIA response (HTTP ${status}).`, { status, code: 'UNKNOWN' })
}

export interface GenerationResult {
  glb: Blob
  seed: number
  finishReason: string
}

/**
 * NVIDIA's hosted NIM function scales its GPU workers to zero when idle. The
 * first request after idle time can hit the platform's ~90s cold-start
 * window and come back as a bare 500 "Internal Server Error" — observed
 * directly against ai.api.nvidia.com, with no proxy involved. The worker is
 * warm immediately afterwards, so one retry reliably succeeds. This is a
 * real characteristic of the free-tier hosted endpoint, not a ChoMU bug.
 */
async function postTrellisWithRetry(
  headers: Record<string, string>,
  data: unknown,
  onRetry?: () => void,
): Promise<{ status: number; data: unknown }> {
  const maxAttempts = 2
  let lastRes: { status: number; data: unknown } | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await apiRequest({ url: TRELLIS_URL, method: 'POST', headers, data, timeoutMs: 300_000 })
    if (res.status !== 500 || attempt === maxAttempts) return res
    lastRes = res
    onRetry?.()
  }
  return lastRes!
}

export async function generateFromText(
  apiKey: string,
  prompt: string,
  params: GenerationParams,
  onRetry?: () => void,
): Promise<GenerationResult> {
  const res = await postTrellisWithRetry(authHeaders(apiKey), { prompt, ...paramsToPayload(params) }, onRetry)
  if (res.status !== 200) handleErrorResponse(res.status, res.data)
  const body = res.data as TrellisResponse
  const artifact = body.artifacts[0]
  return {
    glb: base64ToBlob(artifact.base64, 'model/gltf-binary'),
    seed: artifact.seed,
    finishReason: artifact.finishReason,
  }
}

interface AssetCreateResponse {
  assetId: string
  uploadUrl: string
}

async function uploadImageAsset(apiKey: string, imageBlob: Blob): Promise<string> {
  const createRes = await apiRequest({
    url: ASSETS_URL,
    method: 'POST',
    headers: authHeaders(apiKey),
    data: { contentType: imageBlob.type || 'image/png', description: 'chomu-image-to-3d-input' },
    timeoutMs: 20_000,
  })
  if (createRes.status !== 200) {
    handleErrorResponse(createRes.status, createRes.data)
  }
  const { assetId, uploadUrl } = createRes.data as AssetCreateResponse

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': imageBlob.type || 'image/png',
      'x-amz-meta-nvcf-asset-description': 'chomu-image-to-3d-input',
    },
    body: imageBlob,
  })
  if (!putRes.ok) {
    throw new NvidiaApiError(`Failed to upload image to NVIDIA asset storage (HTTP ${putRes.status}).`, {
      status: putRes.status,
    })
  }
  return assetId
}

export async function generateFromImage(
  apiKey: string,
  imageBlob: Blob,
  params: GenerationParams,
  onRetry?: () => void,
): Promise<GenerationResult> {
  const assetId = await uploadImageAsset(apiKey, imageBlob)

  const res = await postTrellisWithRetry(
    authHeaders(apiKey, { 'NVCF-INPUT-ASSET-REFERENCES': assetId }),
    { image: `data:${imageBlob.type || 'image/png'};asset_id,${assetId}`, ...paramsToPayload(params) },
    onRetry,
  )
  if (res.status !== 200) handleErrorResponse(res.status, res.data)
  const body = res.data as TrellisResponse
  const artifact = body.artifacts[0]
  return {
    glb: base64ToBlob(artifact.base64, 'model/gltf-binary'),
    seed: artifact.seed,
    finishReason: artifact.finishReason,
  }
}
