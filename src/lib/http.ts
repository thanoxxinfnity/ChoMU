import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface RawResponse {
  status: number
  headers: Record<string, string>
  data: unknown
}

/**
 * Thrown when the request never got an HTTP response at all — the
 * connection itself failed (TLS/SSL error, DNS failure, connection reset).
 * Distinguished from a normal NvidiaApiError so callers can retry it the
 * same way they retry a 500: this class of failure is common on mobile
 * networks when a long-lived request (NVIDIA's requests can take up to
 * ~90s) outlives a WiFi/mobile-data handoff, which can corrupt the TLS
 * session mid-stream (observed directly: BoringSSL "BAD_DECRYPT" /
 * "DECRYPTION_FAILED_OR_BAD_RECORD_MAC" on a fresh retry succeeding right
 * after). Not a ChoMU bug — the fix is a clean retry over a fresh
 * connection, which this class exists to make possible.
 */
export class NetworkConnectionError extends Error {
  constructor(cause: string) {
    super(`Connection to NVIDIA failed before a response was received: ${cause}`)
    this.name = 'NetworkConnectionError'
  }
}

/**
 * NVIDIA's API does not send Access-Control-Allow-Origin, so a browser/WebView
 * fetch() is blocked by CORS. On a native Android build we route the request
 * through Capacitor's native HTTP bridge, which is not subject to CORS at all
 * because it never goes through the WebView's JS fetch stack. In the Vite dev
 * server (browser preview) we go through the /nvidia-api proxy configured in
 * vite.config.ts instead, so the same code path can be exercised for testing.
 */
export async function apiRequest(opts: {
  url: string
  method: 'GET' | 'POST' | 'PUT'
  headers?: Record<string, string>
  data?: unknown
  responseType?: 'json' | 'text' | 'arraybuffer'
  timeoutMs?: number
}): Promise<RawResponse> {
  const { url, method, headers = {}, data, responseType = 'json', timeoutMs = 300_000 } = opts

  if (Capacitor.isNativePlatform()) {
    try {
      const res = await CapacitorHttp.request({
        url,
        method,
        headers,
        data,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        responseType: responseType === 'arraybuffer' ? 'arraybuffer' : 'json',
      })
      return { status: res.status, headers: res.headers ?? {}, data: res.data }
    } catch (e) {
      // CapacitorHttp rejects (rather than resolving with a status code) when
      // the connection itself fails — no HTTP response was ever received.
      throw new NetworkConnectionError((e as Error).message ?? String(e))
    }
  }

  // Browser / dev server path
  const isDev = url.startsWith('https://ai.api.nvidia.com') || url.startsWith('https://api.nvcf.nvidia.com')
  const target = isDev ? toDevProxyUrl(url) : url

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(target, {
      method,
      headers,
      body: data === undefined ? undefined : typeof data === 'string' ? data : JSON.stringify(data),
      signal: controller.signal,
    })
    const respHeaders: Record<string, string> = {}
    res.headers.forEach((v, k) => (respHeaders[k] = v))

    let body: unknown
    if (responseType === 'arraybuffer') {
      const buf = await res.arrayBuffer()
      body = arrayBufferToBase64(buf)
    } else {
      const text = await res.text()
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = text
      }
    }
    return { status: res.status, headers: respHeaders, data: body }
  } finally {
    clearTimeout(timer)
  }
}

function toDevProxyUrl(url: string): string {
  if (url.startsWith('https://ai.api.nvidia.com')) {
    return url.replace('https://ai.api.nvidia.com', '/nvidia-genai')
  }
  if (url.startsWith('https://api.nvcf.nvidia.com')) {
    return url.replace('https://api.nvcf.nvidia.com', '/nvidia-nvcf')
  }
  return url
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
