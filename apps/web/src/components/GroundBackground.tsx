'use client'

import { useEffect, useRef } from 'react'

const VERTEX_SHADER = `
  attribute vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const FRAGMENT_SHADER = `
  precision highp float;
  uniform float u_time;
  uniform vec2 u_resolution;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / min(u_resolution.x, u_resolution.y);

    float depth = 1.0 / (uv.y + 1.15);
    vec2 gridUv = vec2(uv.x * depth, depth + u_time * 0.15);

    float n = noise(gridUv * 3.5);
    float ripples = sin(gridUv.y * 18.0 + n * 8.0 + u_time * 0.5);

    float topoLine = smoothstep(0.03, 0.0, abs(ripples));

    vec3 baseColor = vec3(0.04, 0.03, 0.12);
    vec3 accentColor = vec3(0.1, 0.3, 0.8);
    vec3 neonColor = vec3(0.6, 0.2, 1.0);

    vec3 finalColor = mix(baseColor, accentColor, n * 0.6);
    finalColor += topoLine * neonColor * depth * 0.4;

    float fade = smoothstep(0.1, -1.0, uv.y);
    finalColor *= (1.0 - length(uv) * 0.45) * (1.0 - fade);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return shader
}

/**
 * Fondo animado en WebGL: líneas topográficas de neón sobre un terreno en
 * perspectiva. Llena el contenedor padre — el padre necesita
 * `position: relative` (o similar) para que el canvas absoluto se recorte
 * a su tamaño en vez de al viewport completo.
 */
export function GroundBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl')
    if (!gl) return

    const program = gl.createProgram()!
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER))
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER))
    gl.linkProgram(program)
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), gl.STATIC_DRAW)

    const posAttrib = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(posAttrib)
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0)

    const timeLoc = gl.getUniformLocation(program, 'u_time')
    const resLoc  = gl.getUniformLocation(program, 'u_resolution')

    let animationFrameId: number

    function render(time: number) {
      const parent = canvas!.parentElement
      const width  = parent?.clientWidth  ?? canvas!.clientWidth
      const height = parent?.clientHeight ?? canvas!.clientHeight

      if (canvas!.width !== width || canvas!.height !== height) {
        canvas!.width  = width
        canvas!.height = height
        gl!.viewport(0, 0, width, height)
      }

      gl!.uniform1f(timeLoc, time * 0.001)
      gl!.uniform2f(resLoc, width, height)
      gl!.drawArrays(gl!.TRIANGLES, 0, 6)
      animationFrameId = requestAnimationFrame(render)
    }

    animationFrameId = requestAnimationFrame(render)

    return () => cancelAnimationFrame(animationFrameId)
  }, [])

  return <canvas ref={canvasRef} className="ground-background-canvas" />
}
