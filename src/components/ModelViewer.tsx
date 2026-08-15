import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Environment, Stage, Bounds, useGLTF } from '@react-three/drei'
import { Loader2, RotateCw, Sun, Moon } from 'lucide-react'
import * as THREE from 'three'
import clsx from 'clsx'

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => scene.clone(true), [scene])
  return <primitive object={cloned} />
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
    }, 600)
    return () => clearTimeout(id)
  }, [gl, scene, camera, onCapture])
  return null
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
  const [viewerLight, setViewerLight] = useState<'studio' | 'sunset' | 'city'>('studio')

  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-2xl border border-black/5 bg-gradient-to-br from-neutral-100 to-neutral-200 dark:border-white/10 dark:from-neutral-900 dark:to-neutral-950',
        className,
      )}
    >
      {url ? (
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [3, 2, 3], fov: 40 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        >
          <Suspense fallback={null}>
            <Stage
              environment={viewerLight}
              intensity={0.7}
              shadows={{ type: 'contact', opacity: 0.4, blur: 2 }}
              adjustCamera={1.2}
            >
              <Bounds fit clip observe margin={1.2}>
                <Model url={url} />
              </Bounds>
            </Stage>
            <Environment preset={viewerLight} background={false} />
            {onThumbnail && <CaptureThumbnail onCapture={onThumbnail} />}
          </Suspense>
          <ambientLight intensity={0.4} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
          <OrbitControls autoRotate={autoRotate} autoRotateSpeed={2.2} enableDamping makeDefault />
        </Canvas>
      ) : (
        <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-neutral-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="text-sm">Waiting for a model…</span>
        </div>
      )}

      <div className="absolute right-3 top-3 flex gap-2">
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
          onClick={() => setViewerLight((v) => (v === 'studio' ? 'sunset' : v === 'sunset' ? 'city' : 'studio'))}
          className="flex h-9 w-9 items-center justify-center rounded-full glass shadow-sm text-neutral-600 dark:text-neutral-300"
          title={`Lighting: ${viewerLight}`}
        >
          {viewerLight === 'studio' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </div>
  )
}
