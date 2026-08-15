import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'

export type ExportFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'ply' | 'usdz'

export const EXPORT_FORMATS: { id: ExportFormat; label: string; mime: string; ext: string; carriesTextures: boolean }[] = [
  { id: 'glb', label: 'GLB (binary glTF)', mime: 'model/gltf-binary', ext: 'glb', carriesTextures: true },
  { id: 'gltf', label: 'glTF (JSON, embedded)', mime: 'model/gltf+json', ext: 'gltf', carriesTextures: true },
  { id: 'usdz', label: 'USDZ (AR Quick Look)', mime: 'model/vnd.usdz+zip', ext: 'usdz', carriesTextures: true },
  { id: 'obj', label: 'OBJ (Wavefront, geometry only)', mime: 'text/plain', ext: 'obj', carriesTextures: false },
  { id: 'stl', label: 'STL (binary, geometry only)', mime: 'model/stl', ext: 'stl', carriesTextures: false },
  { id: 'ply', label: 'PLY (binary, geometry only)', mime: 'application/octet-stream', ext: 'ply', carriesTextures: false },
]

/** Real texture sizes NVIDIA's TRELLIS never exposes as a generation-time
 *  control (its API schema is fixed to prompt/image + seed + cfg/sampling-step
 *  fields). This resizes whatever texture the model actually produced —
 *  genuine canvas downscale/upscale, not an AI re-render. */
export const TEXTURE_RESOLUTIONS = [
  { id: 'original', label: 'Original', size: null as number | null },
  { id: '1k', label: '1K', size: 1024 },
  { id: '2k', label: '2K', size: 2048 },
  { id: '4k', label: '4K', size: 4096 },
  { id: '8k', label: '8K', size: 8192 },
] as const

export type TextureResolutionId = (typeof TEXTURE_RESOLUTIONS)[number]['id']

async function loadGlbAsScene(glbBlob: Blob): Promise<THREE.Group> {
  const loader = new GLTFLoader()
  const arrayBuffer = await glbBlob.arrayBuffer()
  return new Promise((resolve, reject) => {
    loader.parse(
      arrayBuffer,
      '',
      (gltf) => resolve(gltf.scene),
      (err) => reject(err),
    )
  })
}

function resizeImageSource(image: TexImageSource, targetLongEdge: number): HTMLCanvasElement {
  const w = 'width' in image ? image.width : 0
  const h = 'height' in image ? image.height : 0
  const scale = targetLongEdge / Math.max(w, h)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  return canvas
}

const MAP_SLOTS = ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'emissiveMap', 'aoMap'] as const

/** Mutates the scene's material textures in place, resizing every image-based
 *  map to the requested long-edge size via a real 2D canvas draw. */
function resizeSceneTextures(scene: THREE.Object3D, targetLongEdge: number) {
  const seen = new Set<THREE.Texture>()
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      const mat = material as THREE.MeshStandardMaterial
      for (const slot of MAP_SLOTS) {
        const tex = mat[slot] as THREE.Texture | null
        if (!tex || !tex.image || seen.has(tex)) continue
        seen.add(tex)
        tex.image = resizeImageSource(tex.image as TexImageSource, targetLongEdge)
        tex.needsUpdate = true
      }
    }
  })
}

export async function exportModel(
  glbBlob: Blob,
  format: ExportFormat,
  textureResolution: TextureResolutionId = 'original',
): Promise<Blob> {
  const targetSize = TEXTURE_RESOLUTIONS.find((r) => r.id === textureResolution)?.size ?? null

  if (format === 'glb' && targetSize === null) return glbBlob

  const scene = await loadGlbAsScene(glbBlob)
  if (targetSize !== null) resizeSceneTextures(scene, targetSize)

  switch (format) {
    case 'glb': {
      const exporter = new GLTFExporter()
      const result = await exporter.parseAsync(scene, { binary: true, embedImages: true })
      return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
    }
    case 'gltf': {
      const exporter = new GLTFExporter()
      const result = await exporter.parseAsync(scene, { binary: false, embedImages: true })
      return new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' })
    }
    case 'obj': {
      const exporter = new OBJExporter()
      const text = exporter.parse(scene)
      return new Blob([text], { type: 'text/plain' })
    }
    case 'stl': {
      const exporter = new STLExporter()
      const arrayBuffer = exporter.parse(scene, { binary: true }) as unknown as DataView
      return new Blob([arrayBuffer.buffer as ArrayBuffer], { type: 'model/stl' })
    }
    case 'ply': {
      const exporter = new PLYExporter()
      const result = await new Promise<ArrayBuffer>((resolve) => {
        exporter.parse(scene, (res) => resolve(res as ArrayBuffer), { binary: true })
      })
      return new Blob([result], { type: 'application/octet-stream' })
    }
    case 'usdz': {
      const exporter = new USDZExporter()
      const result = await exporter.parseAsync(scene)
      return new Blob([result.buffer as ArrayBuffer], { type: 'model/vnd.usdz+zip' })
    }
    default:
      throw new Error(`Unsupported export format: ${format}`)
  }
}

export function formatMeta(format: ExportFormat) {
  return EXPORT_FORMATS.find((f) => f.id === format)!
}
