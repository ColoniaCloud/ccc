'use client'

import { useEffect, useRef } from 'react'

const SCALE = 2
const TABLE_SIZE = 1024
const FULL_CIRCLE = Math.PI * 2

/**
 * Fondo procedural de ondas para las páginas públicas.
 * Se dibuja a menor resolución y se escala para mantener el costo razonable.
 */
export default function HeroWave() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const currentCanvas = canvasRef.current
    if (!currentCanvas) return
    const canvas: HTMLCanvasElement = currentCanvas

    const currentContext = canvas.getContext('2d', { alpha: false })
    if (!currentContext) return
    const context: CanvasRenderingContext2D = currentContext

    let width = 0
    let height = 0
    let imageData: ImageData | null = null
    let pixels: Uint8ClampedArray | null = null
    let animationFrameId = 0
    let previousFrameTime = 0

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const startTime = performance.now()

    const sinTable = new Float32Array(TABLE_SIZE)
    const cosTable = new Float32Array(TABLE_SIZE)

    for (let index = 0; index < TABLE_SIZE; index += 1) {
      const angle = (index / TABLE_SIZE) * FULL_CIRCLE
      sinTable[index] = Math.sin(angle)
      cosTable[index] = Math.cos(angle)
    }

    function fastSin(value: number) {
      const index = Math.floor(((value % FULL_CIRCLE) / FULL_CIRCLE) * TABLE_SIZE) & (TABLE_SIZE - 1)
      return sinTable[index] ?? 0
    }

    function fastCos(value: number) {
      const index = Math.floor(((value % FULL_CIRCLE) / FULL_CIRCLE) * TABLE_SIZE) & (TABLE_SIZE - 1)
      return cosTable[index] ?? 0
    }

    function resizeCanvas() {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      width = Math.max(1, Math.floor(canvas.width / SCALE))
      height = Math.max(1, Math.floor(canvas.height / SCALE))
      imageData = context.createImageData(width, height)
      pixels = imageData.data
    }

    function draw(timestamp: number) {
      const currentImageData = imageData
      const currentPixels = pixels
      if (!currentImageData || !currentPixels) return

      const time = (timestamp - startTime) * 0.001

      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const horizontal = (2 * x - width) / height
          const vertical = (2 * y - height) / height

          let angle = 0
          let distance = 0

          for (let iteration = 0; iteration < 4; iteration += 1) {
            angle += fastCos(iteration - distance + time * 0.5 - angle * horizontal)
            distance += fastSin(iteration * vertical + angle)
          }

          const wave = (fastSin(angle) + fastCos(distance)) * 0.5
          const intensity = 0.3 + 0.4 * wave
          const baseValue = 0.1 + 0.15 * fastCos(horizontal + vertical + time * 0.3)
          const blueAccent = 0.2 * fastSin(angle * 1.5 + time * 0.2)
          const purpleAccent = 0.15 * fastCos(distance * 2 + time * 0.1)

          const red = Math.max(0, Math.min(1, baseValue + purpleAccent * 0.8)) * intensity
          const green = Math.max(0, Math.min(1, baseValue + blueAccent * 0.6)) * intensity
          const blue = Math.max(0, Math.min(1, baseValue + blueAccent * 1.2 + purpleAccent * 0.4)) * intensity

          const pixelIndex = (y * width + x) * 4
          currentPixels[pixelIndex] = red * 255
          currentPixels[pixelIndex + 1] = green * 255
          currentPixels[pixelIndex + 2] = blue * 255
          currentPixels[pixelIndex + 3] = 255
        }
      }

      context.putImageData(currentImageData, 0, 0)
      context.imageSmoothingEnabled = false
      context.drawImage(canvas, 0, 0, width, height, 0, 0, canvas.width, canvas.height)
    }

    function render(timestamp: number) {
      // Limita el trabajo a 30 FPS; el algoritmo procesa cientos de miles de píxeles.
      if (timestamp - previousFrameTime >= 1000 / 30) {
        previousFrameTime = timestamp
        draw(timestamp)
      }
      animationFrameId = requestAnimationFrame(render)
    }

    resizeCanvas()
    draw(startTime)

    if (!reducedMotion) {
      animationFrameId = requestAnimationFrame(render)
    }

    window.addEventListener('resize', resizeCanvas)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="dynamic-wave-canvas-background pointer-events-none fixed inset-0 size-full"
      aria-hidden="true"
    />
  )
}
