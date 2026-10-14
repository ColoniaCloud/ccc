import sharp from 'sharp'
import { and, asc, eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import type { CatalogKind } from '@crm/shared'
import type { TenantTx } from '../db/tenant-db'
import { catalogPhotos, tenants } from '../db/schema'
import { catalogItem, requireCatalog } from './service'
import { isUuid } from './validation'
export const MAX_PHOTOS = 12, MAX_UPLOAD = 6 * 1024 * 1024, MAX_ORG_BYTES = 100 * 1024 * 1024
sharp.cache({ memory: 32, files: 0, items: 32 })
sharp.concurrency(2)
let decoding = 0
export async function normalizePhoto(input: Buffer) {
  if (!input.length || input.length > MAX_UPLOAD) throw new HTTPException(413, { message: 'La foto debe pesar hasta 6 MB' })
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255
  const png = input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
  const webp = input.subarray(0, 4).toString() === 'RIFF' && input.subarray(8, 12).toString() === 'WEBP'
  if (!jpeg && !png && !webp) throw new HTTPException(400, { message: 'Usá una imagen JPEG, PNG o WebP válida' })
  if (decoding >= 2) throw new HTTPException(429, { message: 'Estamos procesando otras fotos. Reintentá en unos segundos' })
  decoding++
  try {
    const image = sharp(input, { limitInputPixels: 16_000_000, failOn: 'warning' })
    const meta = await image.metadata()
    if (!['jpeg','png','webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('format')
    const result = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true })
    if (result.data.length > 524288) throw new HTTPException(413, { message: 'La foto es demasiado compleja. Reducí su tamaño y reintentá' })
    return { content: result.data, width: result.info.width, height: result.info.height, byteSize: result.data.length }
  } catch (error) {
    if (error instanceof HTTPException) throw error
    throw new HTTPException(400, { message: 'Usá una imagen JPEG, PNG o WebP válida, sin animación y de hasta 16 megapíxeles' })
  } finally { decoding-- }
}
const scope = (tenantId: string, kind: CatalogKind, assetId: string) => and(eq(catalogPhotos.tenantId, tenantId), eq(kind === 'properties' ? catalogPhotos.propertyId : catalogPhotos.vehicleId, assetId))
const metadata = { id: catalogPhotos.id, position: catalogPhotos.position, width: catalogPhotos.width, height: catalogPhotos.height, byteSize: catalogPhotos.byteSize }
export async function photoList(tx: TenantTx, tenantId: string, kind: CatalogKind, assetId: string) {
  await requireCatalog(tx, tenantId, kind); await catalogItem(tx, tenantId, kind, assetId)
  return tx.select(metadata).from(catalogPhotos).where(scope(tenantId, kind, assetId)).orderBy(asc(catalogPhotos.position), asc(catalogPhotos.id))
}
async function lock(tx: TenantTx, tenantId: string, kind: CatalogKind, assetId: string) {
  await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId)).for('update')
  await requireCatalog(tx, tenantId, kind); await catalogItem(tx, tenantId, kind, assetId, true)
}
export async function addPhoto(tx: TenantTx, tenantId: string, kind: CatalogKind, assetId: string, image: Awaited<ReturnType<typeof normalizePhoto>>) {
  await lock(tx, tenantId, kind, assetId)
  const current = await photoList(tx, tenantId, kind, assetId)
  if (current.length >= MAX_PHOTOS) throw new HTTPException(409, { message: 'La ficha admite hasta 12 fotos' })
  const [usage] = await tx.select({ total: sql<number>`coalesce(sum(${catalogPhotos.byteSize}),0)::int` }).from(catalogPhotos).where(eq(catalogPhotos.tenantId, tenantId))
  if (usage!.total + image.byteSize > MAX_ORG_BYTES) throw new HTTPException(409, { message: 'Alcanzaste los 100 MB de fotos del piloto. Eliminá fotos que ya no uses' })
  const [item] = await tx.insert(catalogPhotos).values({ ...image, tenantId, propertyId: kind === 'properties' ? assetId : null, vehicleId: kind === 'vehicles' ? assetId : null, position: Math.max(-1, ...current.map(p => p.position)) + 1 }).returning(metadata)
  return item!
}
export async function photoFile(tx: TenantTx, tenantId: string, kind: CatalogKind, assetId: string, photoId: string) {
  await requireCatalog(tx, tenantId, kind); await catalogItem(tx, tenantId, kind, assetId)
  if (!isUuid(photoId)) throw new HTTPException(400, { message: 'Foto inválida' })
  const [photo] = await tx.select({ content: catalogPhotos.content }).from(catalogPhotos).where(and(scope(tenantId, kind, assetId), eq(catalogPhotos.id, photoId)))
  if (!photo) throw new HTTPException(404, { message: 'Foto no encontrada' })
  return photo.content
}
export async function deletePhoto(tx: TenantTx, tenantId: string, kind: CatalogKind, assetId: string, photoId: string) {
  await lock(tx, tenantId, kind, assetId)
  if (!isUuid(photoId)) throw new HTTPException(400, { message: 'Foto inválida' })
  const rows = await tx.delete(catalogPhotos).where(and(scope(tenantId, kind, assetId), eq(catalogPhotos.id, photoId))).returning({ id: catalogPhotos.id })
  if (!rows.length) throw new HTTPException(404, { message: 'Foto no encontrada' })
}
export async function reorderPhotos(tx: TenantTx, tenantId: string, kind: CatalogKind, assetId: string, ids: unknown) {
  await lock(tx, tenantId, kind, assetId)
  const current = await photoList(tx, tenantId, kind, assetId)
  if (!Array.isArray(ids) || ids.length !== current.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !current.some(p => p.id === id))) throw new HTTPException(409, { message: 'La galería cambió. Recargá las fotos antes de ordenarlas' })
  for (const [position, id] of ids.entries()) await tx.update(catalogPhotos).set({ position }).where(and(scope(tenantId, kind, assetId), eq(catalogPhotos.id, id)))
}
