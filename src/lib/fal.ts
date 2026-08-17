/**
 * fal.ai's hosted TRELLIS model (https://fal.ai/models/fal-ai/trellis) — a
 * paid, pay-per-use image-to-3D API that, unlike NVIDIA's free preview,
 * genuinely accepts real uploaded photos (NVIDIA's hosted endpoint rejects
 * anything but its own preset "example_id" gallery images server-side —
 * see nvidia.ts). Flow: get a storage upload token, upload the image,
 * submit a queue job referencing its URL, poll until complete, then
 * download the resulting GLB.
 *
 * Requires the user's own fal.ai API key (Settings) — this is a separate
 * paid service, not bundled with NVIDIA's key.
 *
 * fal.ai's endpoints send proper CORS headers (verified directly against
 * queue.fal.run and rest.alpha.fal.ai), so — unlike NVIDIA's API — this
 * works via a plain fetch() on every platform without a native bridge or
 * dev-proxy workaround.
 */

export class FalApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'FalApiError'
    this.status = status
  }
}

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 5 * 60 * 1000

async function requestJson(url: string, authHeader: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { Authorization: authHeader, ...(init.headers ?? {}) } })
  } catch (e) {
    throw new FalApiError(`Network error reaching fal.ai: ${(e as Error).message}`)
  }
  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 200)
    try {
      const parsed = JSON.parse(text)
      detail = parsed?.error?.message || parsed?.detail || detail
    } catch {
      // keep the raw text snippet
    }
    if (res.status === 401 || res.status === 403) {
      throw new FalApiError('The fal.ai API key was rejected. Check the key in Settings.', res.status)
    }
    if (res.status === 429) {
      throw new FalApiError('fal.ai rate limit reached. Wait a moment and retry.', res.status)
    }
    throw new FalApiError(`fal.ai request failed (HTTP ${res.status}). ${detail}`, res.status)
  }
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new FalApiError('fal.ai returned an unexpected (non-JSON) response.')
  }
}

async function uploadImage(imageBlob: Blob, authHeader: string): Promise<string> {
  const tokenJson = await requestJson(
    'https://rest.alpha.fal.ai/storage/auth/token?storage_type=fal-cdn-v3',
    authHeader,
    { method: 'POST' },
  )
  const token = tokenJson.token as string | undefined
  const baseUrl = tokenJson.base_url as string | undefined
  if (!token) throw new FalApiError('fal.ai did not return a storage token.')
  if (!baseUrl) throw new FalApiError('fal.ai did not return a storage base URL.')

  const mime = imageBlob.type || 'image/png'
  const uploadJson = await requestJson(`${baseUrl}/files/upload`, `Bearer ${token}`, {
    method: 'POST',
    headers: { 'Content-Type': mime },
    body: imageBlob,
  })
  const accessUrl = uploadJson.access_url as string | undefined
  if (!accessUrl) throw new FalApiError('fal.ai did not return an access URL for the uploaded image.')
  return accessUrl
}

export async function generateFromImageFal(
  apiKey: string,
  imageBlob: Blob,
  onStatus?: (status: string) => void,
): Promise<{ glb: Blob }> {
  if (!apiKey.trim()) {
    throw new FalApiError('fal.ai API key is missing. Add your key in Settings.')
  }
  const authHeader = `Key ${apiKey.trim()}`

  onStatus?.('Uploading image…')
  const imageUrl = await uploadImage(imageBlob, authHeader)

  onStatus?.('Queuing 3D generation…')
  // ss_sampling_steps/slat_sampling_steps default to 12 and texture_size to
  // 1024 if unset (confirmed against fal.ai's own API docs) — pushing both
  // up gives a genuinely higher-detail mesh and the max texture resolution
  // fal.ai supports, instead of silently generating at API defaults.
  const submitJson = await requestJson('https://queue.fal.run/fal-ai/trellis', authHeader, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      ss_sampling_steps: 30,
      slat_sampling_steps: 30,
      texture_size: '2048',
    }),
  })
  const statusUrl = submitJson.status_url as string | undefined
  const responseUrl = submitJson.response_url as string | undefined
  if (!statusUrl) throw new FalApiError('fal.ai did not return a status URL.')
  if (!responseUrl) throw new FalApiError('fal.ai did not return a response URL.')

  onStatus?.('Generating 3D model… this can take 30–90 seconds.')
  const deadline = Date.now() + POLL_TIMEOUT_MS
  for (;;) {
    const statusJson = await requestJson(statusUrl, authHeader)
    const status = statusJson.status as string
    if (status === 'COMPLETED') break
    if (status !== 'IN_QUEUE' && status !== 'IN_PROGRESS') {
      throw new FalApiError(`fal.ai generation failed: ${(statusJson.error as string) || 'unknown error'}`)
    }
    if (Date.now() > deadline) throw new FalApiError('3D generation timed out. Please try again.')
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  onStatus?.('Downloading 3D model…')
  const resultJson = await requestJson(responseUrl, authHeader)
  const meshUrl = (resultJson.model_mesh as { url?: string } | undefined)?.url
  if (!meshUrl) throw new FalApiError('fal.ai response did not include a model_mesh URL.')

  const meshRes = await fetch(meshUrl, { headers: { Authorization: authHeader } })
  if (!meshRes.ok) throw new FalApiError(`Could not download the generated model (HTTP ${meshRes.status}).`, meshRes.status)
  const glb = await meshRes.blob()
  return { glb }
}
