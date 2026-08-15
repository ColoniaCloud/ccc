import Image from 'next/image'

/* Proporción real del isologo (viewBox 1606 × 498). El alto se fija en cada
   uso y el ancho se deriva de acá, así el logo nunca se deforma. */
const RATIO = 1606 / 498

type LogoProps = {
  /** Alto del isologo en px. */
  height?: number
  /** Marcarlo como LCP (nav de la landing, header de auth). */
  priority?: boolean
  className?: string
}

/**
 * Isologo de Plata (isotipo + logotipo).
 *
 * Usa la variante de wordmark claro, que es la que corresponde al tema oscuro
 * — el único activo hoy. Si en algún momento se cablea `data-theme="light"`,
 * hay que alternar con `/isologo.svg` (wordmark negro) desde acá.
 */
export function Logo({ height = 28, priority = false, className }: LogoProps) {
  const width = Math.round(height * RATIO)
  return (
    <Image
      src="/isologo-blanco.svg"
      alt="Plata"
      width={width}
      height={height}
      priority={priority}
      unoptimized /* es SVG: no hay nada que optimizar */
      className={['brand-logo', className].filter(Boolean).join(' ')}
      /* El preflight de Tailwind fuerza `img { height: auto }`, que sin un
         width fijo hace que la imagen ocupe el 100% del contenedor en vez
         del tamaño pedido. Un style inline gana esa pulseada. */
      style={{ width, height }}
    />
  )
}
