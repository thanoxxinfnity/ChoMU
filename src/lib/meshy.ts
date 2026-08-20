/**
 * Auto-rigging via Meshy's Rigging API.
 *
 * Worth being precise about what this is: an animation library (three.js and
 * friends) can only *play* animation clips that already exist in a file. It
 * cannot invent a skeleton or skin weights for a bare mesh — that's a
 * separate AI problem. TRELLIS returns static geometry with no bones, so
 * rigging has to come from a service that actually does it.
 *
 * Meshy's endpoint takes a GLB (as a public URL or a data URI, so ChoMU can
 * post a locally generated model straight up), fits a humanoid skeleton, and
 * returns a rigged GLB/FBX with basic walk and run clips — which the viewer
 * can then play.
 *
 * Requires the user's own Meshy API key, and API access is only on their paid
 * plans (their free tier has no API). Entirely optional: without a key
 * nothing here runs and the rest of the app is unaffected.
 */

export class MeshyApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'MeshyApiError'
    this.status = status
  }
}

const RIGGING_URL = 'https://api.meshy.ai/openapi/v1/rigging'
const POLL_INTERVAL_MS = 4000
const POLL_TIMEOUT_MS = 10 * 60 * 1000

async function requestJson(
  url: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
    })
  } catch (e) {
    throw new MeshyApiError(`Network error reaching Meshy: ${(e as Error).message}`)
  }

  const text = await res.text()
  if (!res.ok) {
    let detail = text.slice(0, 200)
    try {
      const parsed = JSON.parse(text)
      detail = parsed?.message || parsed?.error || detail
    } catch {
      // keep the raw snippet
    }
    if (res.status === 401 || res.status === 403) {
      throw new MeshyApiError(
        'Meshy rejected the API key. Check it in Settings — note that Meshy only allows API access on their paid plans.',
        res.status,
      )
    }
    if (res.status === 402) {
      throw new MeshyApiError('Your Meshy account is out of credits for this task.', res.status)
    }
    if (res.status === 429) {
      throw new MeshyApiError('Meshy rate limit reached. Wait a moment and retry.', res.status)
    }
    throw new MeshyApiError(`Meshy request failed (HTTP ${res.status}). ${detail}`, res.status)
  }

  try {
    return text ? JSON.parse(text) : {}
  } catch {
    throw new MeshyApiError('Meshy returned an unexpected (non-JSON) response.')
  }
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = () => reject(new MeshyApiError('Could not read the model file.'))
    reader.readAsDataURL(blob)
  })
}

export async function rigModel(
  apiKey: string,
  glbBlob: Blob,
  onStatus?: (status: string) => void,
): Promise<{ glb: Blob }> {
  if (!apiKey.trim()) {
    throw new MeshyApiError('Meshy API key is missing. Add your key in Settings.')
  }
  const key = apiKey.trim()

  onStatus?.('Uploading model…')
  const dataUri = await blobToDataUri(new Blob([glbBlob], { type: 'model/gltf-binary' }))

  onStatus?.('Queuing rigging…')
  const submit = await requestJson(RIGGING_URL, key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model_url: dataUri, height_meters: 1.7 }),
  })

  const taskId = (submit.result as string) || (submit.id as string)
  if (!taskId) throw new MeshyApiError('Meshy did not return a rigging task id.')

  onStatus?.('Rigging… this usually takes under a minute.')
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let modelUrl: string | undefined

  for (;;) {
    const task = await requestJson(`${RIGGING_URL}/${taskId}`, key)
    const status = (task.status as string) ?? ''

    if (status === 'SUCCEEDED') {
      const urls = (task.model_urls ?? task.result) as Record<string, string> | undefined
      modelUrl = urls?.glb
      if (!modelUrl) throw new MeshyApiError('Meshy finished but returned no rigged GLB.')
      break
    }
    if (status === 'FAILED' || status === 'CANCELED') {
      const err = (task.task_error as { message?: string } | undefined)?.message
      throw new MeshyApiError(
        err ||
          'Rigging failed. Meshy only rigs textured humanoid models with clear arms and legs — a vehicle or abstract shape will not work.',
      )
    }
    if (Date.now() > deadline) throw new MeshyApiError('Rigging timed out. Please try again.')
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  onStatus?.('Downloading rigged model…')
  const res = await fetch(modelUrl)
  if (!res.ok) {
    throw new MeshyApiError(`Could not download the rigged model (HTTP ${res.status}).`, res.status)
  }
  return { glb: await res.blob() }
}
