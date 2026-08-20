import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, useAnimations } from '@react-three/drei'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { Loader2, RotateCw, Sun, Moon, AlertTriangle, Play, Pause } from 'lucide-react'
import * as THREE from 'three'
import clsx from 'clsx'

/**
 * Normalizes whatever the generator returned into a predictable size and
 * position: centered on the origin and scaled so its longest edge is
 * NORMALIZED_SIZE units, which the fixed camera below is positioned to frame.
 *
 * This replaced drei's <Stage> + <Bounds> combination, which rendered a
 * completely blank (but error-free) viewer for real TRELLIS output: both
 * helpers try to own centering/scaling/camera-fitting, and when nested they
 * fight — Bounds measures content that Stage has already transformed, so the
 * model ends up scaled or positioned outside the frustum with nothing logged.
 * Doing the math explicitly here can't disagree with itself.
 */
const NORMALIZED_SIZE = 2

function Model({
  url,
  playing,
  onAnimationsFound,
}: {
  url: string
  playing: boolean
  onAnimationsFound?: (count: number) => void
}) {
  const { scene, animations } = useGLTF(url)
  const root = useRef<THREE.Group>(null)

  const { model, scale, offset } = useMemo(() => {
    // A plain .clone() detaches skinned meshes from their bones, so a rigged
    // model would render in its bind pose and never animate. SkeletonUtils
    // rebuilds the bone references along with the hierarchy.
    const cloned = cloneSkinned(scene)

    // Real generated meshes arrive with arbitrary extents and off-origin centers.
    const box = new THREE.Box3().setFromObject(cloned)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1

    cloned.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      // Generated meshes are frequently single-sided with inconsistent winding,
      // which reads as missing faces from some angles.
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        if (material) material.side = THREE.DoubleSide
      }
    })

    return {
      model: cloned,
      scale: NORMALIZED_SIZE / maxDim,
      offset: new THREE.Vector3(-center.x, -center.y, -center.z),
    }
  }, [scene])

  const { actions, names } = useAnimations(animations, root)

  useEffect(() => {
    onAnimationsFound?.(names.length)
  }, [names.length, onAnimationsFound])

  useEffect(() => {
    if (!names.length) return
    const action = actions[names[0]]
    if (!action) return
    if (playing) action.reset().fadeIn(0.2).play()
    else action.fadeOut(0.2)
    return () => {
      action.fadeOut(0.1)
    }
  }, [actions, names, playing])

  return (
    <group ref={root} scale={scale}>
      <primitive object={model} position={offset} />
    </group>
  )
}

/**
 * PBR environment lighting generated procedurally on-device.
 *
 * drei's <Environment preset="…"> downloads an HDR file from a CDN at
 * runtime, which made the viewer silently fail whenever that fetch didn't
 * succeed — offline, on a bad mobile connection, or behind any network
 * restriction. The failed fetch threw inside the Canvas subtree and took the
 * entire viewer down, leaving an empty box with nothing logged, which is
 * exactly the "model generated but nothing shows" symptom. three.js ships
 * RoomEnvironment for this: it builds an equivalent studio environment from
 * geometry at runtime, so the viewer never touches the network.
 */
function OfflineEnvironment({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree()

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture
    return () => {
      scene.environment = null
      envTexture.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  useEffect(() => {
    scene.environmentIntensity = intensity
  }, [scene, intensity])

  return null
}

function CaptureThumbnail({ onCapture }: { onCapture: (dataUrl: string) => void }) {
  const { gl, scene, camera } = useThree()
  const captured = useRef(false)
  useEffect(() => {
    if (captured.current) return
    const id = setTimeout(() => {
      captured.current = true
      gl.render(scene, camera)
      onCapture(gl.domElement.toDataURL('image/jpeg', 0.85))
    }, 800)
    return () => clearTimeout(id)
  }, [gl, scene, camera, onCapture])
  return null
}

/** Without this, a GLB that fails to parse takes the whole Canvas subtree
 *  down and the user just sees an empty box with no explanation. */
class ViewerErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[ChoMU] 3D viewer failed to render the model:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-6 text-center text-neutral-500">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <span className="text-sm font-medium">This model couldn't be displayed</span>
          <span className="text-xs">
            The file is still saved in your Gallery and can be exported — try downloading it and opening it in another
            viewer.
          </span>
        </div>
      )
    }
    return this.props.children
  }
}

export function ModelViewer({
  url,
  onThumbnail,
  className,
}: {
  url: string | null
  onThumbnail?: (dataUrl: string) => void
  className?: string
}) {
  const [autoRotate, setAutoRotate] = useState(true)
  const [bright, setBright] = useState(true)
  // Only meaningful for models that actually carry animation clips (a rigged
  // export); static generated meshes never show these controls.
  const [animationCount, setAnimationCount] = useState(0)
  const [playing, setPlaying] = useState(true)

  useEffect(() => {
    setAnimationCount(0)
    setPlaying(true)
  }, [url])

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-neutral-100 to-neutral-200 dark:border-white/10 dark:from-neutral-900 dark:to-neutral-950',
        className,
      )}
    >
      {url ? (
        <ViewerErrorBoundary key={url}>
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [2.4, 1.8, 2.4], fov: 45, near: 0.01, far: 100 }}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.1,
              // Required for the thumbnail readback below to return actual pixels.
              preserveDrawingBuffer: true,
            }}
          >
            <ambientLight intensity={bright ? 0.6 : 0.25} />
            <hemisphereLight intensity={0.4} groundColor="#404040" />
            <directionalLight position={[5, 8, 5]} intensity={bright ? 1.6 : 0.9} castShadow />
            <directionalLight position={[-5, 3, -4]} intensity={0.7} />
            <OfflineEnvironment intensity={bright ? 1 : 0.45} />

            <Suspense fallback={null}>
              <Model url={url} playing={playing} onAnimationsFound={setAnimationCount} />
              {onThumbnail && <CaptureThumbnail onCapture={onThumbnail} />}
            </Suspense>

            <OrbitControls
              autoRotate={autoRotate}
              autoRotateSpeed={2.2}
              enableDamping
              enablePan
              minDistance={0.5}
              maxDistance={20}
              makeDefault
            />
          </Canvas>
        </ViewerErrorBoundary>
      ) : (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Waiting for a model…</span>
        </div>
      )}

      {url && (
        <div className="absolute right-3 top-3 flex gap-2">
          {animationCount > 0 && (
            <button
              onClick={() => setPlaying((v) => !v)}
              className="flex h-9 w-9 items-center justify-center rounded-full glass text-violet-600 shadow-sm transition dark:text-violet-400"
              title={playing ? 'Pause animation' : 'Play animation'}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={() => setAutoRotate((v) => !v)}
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-full glass shadow-sm transition',
              autoRotate ? 'text-violet-600 dark:text-violet-400' : 'text-neutral-500',
            )}
            title="Toggle auto-rotate"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setBright((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full glass shadow-sm text-neutral-600 dark:text-neutral-300"
            title={bright ? 'Lighting: bright' : 'Lighting: dim'}
          >
            {bright ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  )
}
