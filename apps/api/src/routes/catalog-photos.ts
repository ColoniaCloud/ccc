import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import type { CatalogKind } from '@crm/shared'
import type { HonoVariables } from '../types'
import { authMiddleware } from '../middleware/auth'
import { tenantAccessMiddleware } from '../middleware/tenant'
import { withTenant } from '../db/tenant-db'
import { normalizePhoto, photoList, photoFile, addPhoto, deletePhoto, reorderPhotos, MAX_UPLOAD } from '../catalogs/photos'
import { startPilot, recordPilotActivity } from '../onboarding/pilot'
export const catalogPhotoRoutes = new Hono<{ Variables: HonoVariables }>()
catalogPhotoRoutes.use('*', authMiddleware, tenantAccessMiddleware, bodyLimit({ maxSize: MAX_UPLOAD, onError: () => { throw new HTTPException(413, { message: 'La foto debe pesar hasta 6 MB' }) } }))
catalogPhotoRoutes.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); c.header('X-Content-Type-Options', 'nosniff'); await next() })
function kind(value: string): CatalogKind {
  if (value !== 'properties' && value !== 'vehicles') throw new HTTPException(404, { message: 'Catálogo no encontrado' })
  return value
}
catalogPhotoRoutes.get('/:kind/:assetId', async c => c.json({ items: await withTenant(c.get('tenantId'), tx => photoList(tx, c.get('tenantId'), kind(c.req.param('kind')), c.req.param('assetId'))) }))
catalogPhotoRoutes.get('/:kind/:assetId/:photoId/file', async c => {
  const content = await withTenant(c.get('tenantId'), tx => photoFile(tx, c.get('tenantId'), kind(c.req.param('kind')), c.req.param('assetId'), c.req.param('photoId')))
  c.header('Content-Type', 'image/webp'); c.header('Content-Disposition', 'inline; filename="foto.webp"')
  return c.body(new Uint8Array(content))
})
catalogPhotoRoutes.post('/:kind/:assetId', async c => {
  const catalog = kind(c.req.param('kind'))
  // Decodificación fuera de la transacción y de los locks comerciales.
  const image = await normalizePhoto(Buffer.from(await c.req.arrayBuffer()))
  const item = await withTenant(c.get('tenantId'), async tx => {
    await startPilot(tx, c.get('tenantId'), c.get('memberId'))
    const saved = await addPhoto(tx, c.get('tenantId'), catalog, c.req.param('assetId'), image)
    await recordPilotActivity(tx, c.get('tenantId'), c.get('memberId')); return saved
  })
  return c.json({ item }, 201)
})
catalogPhotoRoutes.patch('/:kind/:assetId/order', async c => {
  const body = await c.req.json().catch(() => null)
  await withTenant(c.get('tenantId'), async tx => {
    await startPilot(tx, c.get('tenantId'), c.get('memberId'))
    await reorderPhotos(tx, c.get('tenantId'), kind(c.req.param('kind')), c.req.param('assetId'), body?.ids)
    await recordPilotActivity(tx, c.get('tenantId'), c.get('memberId'))
  })
  return c.json({ status: 'ok' })
})
catalogPhotoRoutes.delete('/:kind/:assetId/:photoId', async c => {
  await withTenant(c.get('tenantId'), async tx => {
    await startPilot(tx, c.get('tenantId'), c.get('memberId'))
    await deletePhoto(tx, c.get('tenantId'), kind(c.req.param('kind')), c.req.param('assetId'), c.req.param('photoId'))
    await recordPilotActivity(tx, c.get('tenantId'), c.get('memberId'))
  })
  return c.json({ status: 'ok' })
})
