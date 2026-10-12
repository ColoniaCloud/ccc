import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // El empaquetado standalone requiere symlinks, restringidos en Windows.
  // Docker/CI corren en Linux y siguen generando la imagen de producción.
  output: process.platform === 'win32' ? undefined : 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
}
export default nextConfig
