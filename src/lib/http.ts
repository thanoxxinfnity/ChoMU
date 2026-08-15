import { Capacitor, CapacitorHttp } from '@capacitor/core'

export interface RawResponse {
  status: number
  headers: Record<string, string>
  data: unknown
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
