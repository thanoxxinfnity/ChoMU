/**
 * Pollinations' free, keyless FLUX text-to-image endpoint. Unlike NVIDIA's
 * API, image.pollinations.ai sends `Access-Control-Allow-Origin: *`
 * (verified directly), so a plain browser fetch() works from both the web
 * dev server and the native Android WebView without any proxy or native
 * HTTP bridge.
 */
const BASE_URL = 'https://image.pollinations.ai/prompt/'

export class PollinationsError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'PollinationsError'
    this.status = status
  }
}

export async function generateImageFlux(prompt: string): Promise<Blob> {
  const seed = Math.floor(Math.random() * 1_000_000_000)
  const url =
    `${BASE_URL}${encodeURIComponent(prompt)}` +
    `?model=flux&nologo=true&width=1024&height=1024&seed=${seed}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new PollinationsError(`Pollinations FLUX request failed (HTTP ${res.status}). Try again.`, res.status)
    }
    const blob = await res.blob()
    if (!blob.type.startsWith('image/')) {
      throw new PollinationsError('Pollinations did not return an image. Try a different prompt.')
    }
    return blob
  } catch (e) {
    if (e instanceof PollinationsError) throw e
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new PollinationsError('Image generation timed out. Try again.')
    }
    throw new PollinationsError(`Network error reaching Pollinations: ${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}
