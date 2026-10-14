import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { eq, sql } from 'drizzle-orm'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as schema from '../../db/schema'
import type { TenantTx } from '../../db/tenant-db'
import { normalizePhoto, addPhoto, photoList, photoFile, reorderPhotos, deletePhoto, MAX_UPLOAD } from '../photos'
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
let client: PGlite, db: ReturnType<typeof drizzle<typeof schema>>, asset: string, other: string, image: Awaited<ReturnType<typeof normalizePhoto>>
const scoped = <T>(tenant: string, run: (tx: TenantTx) => Promise<T>) => db.transaction(async tx => {
  await tx.execute(sql`SET LOCAL ROLE plata_app`); await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenant}, true)`); return run(tx as unknown as TenantTx)
})
beforeAll(async () => {
  client = new PGlite(); db = drizzle(client, { schema }); await client.exec('CREATE ROLE plata_app;')
  const folder = path.resolve('src/db/migrations'), journal = JSON.parse(readFileSync(path.join(folder,'meta/_journal.json'),'utf8'))
  for (const { tag } of journal.entries) await client.exec(readFileSync(path.join(folder,`${tag}.sql`),'utf8'))
  await client.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO plata_app;')
  image = await normalizePhoto(await sharp({ create: { width: 100, height: 80, channels: 3, background: '#ccc' } }).png().toBuffer())
}, 30000)
beforeEach(async () => {
  await client.exec(`TRUNCATE tenants CASCADE; INSERT INTO tenants (id,name,slug) VALUES ('${A}','A','a'),('${B}','B','b'); INSERT INTO tenant_modules (tenant_id,module_key) VALUES ('${A}','properties'),('${B}','properties');`)
  const rows = await db.insert(schema.properties).values([{ tenantId: A, title: 'Casa', operation: 'sale', propertyType: 'house', address: '123', city: 'Colonia' }, { tenantId: B, title: 'Otra', operation: 'sale', propertyType: 'house', address: '456', city: 'Colonia' }]).returning()
  asset = rows[0]!.id; other = rows[1]!.id
})
afterAll(async () => client.close())
describe('imágenes privadas de catálogo', () => {
  it('normaliza orientación, tamaño y formato y elimina EXIF', async () => {
    const source = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#abc' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer()
    const normalized = await normalizePhoto(source), meta = await sharp(normalized.content).metadata()
    expect(meta.format).toBe('webp'); expect(meta.width).toBe(800); expect(meta.height).toBe(1600)
    expect(meta.exif).toBeUndefined(); expect(meta.orientation).toBeUndefined(); expect(normalized.byteSize).toBe(normalized.content.length)
  })
  it('rechaza SVG, bytes corruptos, archivos grandes e imágenes excesivas', async () => {
    await expect(normalizePhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'))).rejects.toMatchObject({ status: 400 })
    await expect(normalizePhoto(Buffer.from('not-image'))).rejects.toMatchObject({ status: 400 })
    await expect(normalizePhoto(Buffer.alloc(MAX_UPLOAD + 1))).rejects.toMatchObject({ status: 413 })
    const huge = await sharp({ create: { width: 4100, height: 4100, channels: 3, background: '#fff' } }).jpeg().toBuffer()
    await expect(normalizePhoto(huge)).rejects.toMatchObject({ status: 400 })
  })
  it('guarda bytes, cambia portada y orden y elige la siguiente al borrar', async () => {
    await scoped(A, async tx => {
      const first = await addPhoto(tx, A, 'properties', asset, image), second = await addPhoto(tx, A, 'properties', asset, image)
      expect(Buffer.from(await photoFile(tx, A, 'properties', asset, first.id))).toEqual(image.content)
      await reorderPhotos(tx, A, 'properties', asset, [second.id, first.id])
      expect((await photoList(tx, A, 'properties', asset))[0]!.id).toBe(second.id)
      await deletePhoto(tx, A, 'properties', asset, second.id)
      expect((await photoList(tx, A, 'properties', asset))[0]!.id).toBe(first.id)
    })
  })
  it('rechaza orden parcial, duplicado o de otra ficha y limita a doce fotos', async () => {
    await scoped(A, async tx => { for (let n = 0; n < 12; n++) await addPhoto(tx, A, 'properties', asset, image) })
    await expect(scoped(A, tx => addPhoto(tx, A, 'properties', asset, image))).rejects.toMatchObject({ status: 409 })
    const ids = (await scoped(A, tx => photoList(tx, A, 'properties', asset))).map(p => p.id)
    await expect(scoped(A, tx => reorderPhotos(tx, A, 'properties', asset, ids.slice(1)))).rejects.toMatchObject({ status: 409 })
    await expect(scoped(A, tx => reorderPhotos(tx, A, 'properties', asset, ids.map(() => ids[0])))).rejects.toMatchObject({ status: 409 })
  })
  it('RLS oculta los bytes y los FKs compuestos bloquean fichas ajenas', async () => {
    const photo = await scoped(A, tx => addPhoto(tx, A, 'properties', asset, image))
    expect(await scoped(B, tx => tx.select().from(schema.catalogPhotos))).toHaveLength(0)
    await expect(scoped(B, tx => photoFile(tx, B, 'properties', other, photo.id))).rejects.toMatchObject({ status: 404 })
    await expect(scoped(B, tx => addPhoto(tx, B, 'properties', asset, image))).rejects.toMatchObject({ status: 404 })
    await expect(db.insert(schema.catalogPhotos).values({ ...image, tenantId: B, propertyId: asset, position: 0 })).rejects.toThrow()
  })
  it('elimina los bytes en cascada al borrar la ficha y revierte escrituras fallidas', async () => {
    await expect(scoped(A, async tx => { await addPhoto(tx, A, 'properties', asset, image); throw new Error('rollback') })).rejects.toThrow('rollback')
    expect(await db.select().from(schema.catalogPhotos)).toHaveLength(0)
    await scoped(A, tx => addPhoto(tx, A, 'properties', asset, image))
    await db.delete(schema.properties).where(eq(schema.properties.id, asset))
    expect(await db.select().from(schema.catalogPhotos)).toHaveLength(0)
  })
  it('separa vehículos y propiedades incluso dentro de la misma organización', async () => {
    await db.insert(schema.tenantModules).values({ tenantId: A, moduleKey: 'vehicles' })
    const [vehicle] = await db.insert(schema.vehicles).values({ tenantId: A, title: 'Auto', make: 'Toyota', model: 'Corolla', year: 2020 }).returning()
    const photo = await scoped(A, tx => addPhoto(tx, A, 'vehicles', vehicle!.id, image))
    expect(await scoped(A, tx => photoList(tx, A, 'properties', asset))).toHaveLength(0)
    expect((await scoped(A, tx => photoList(tx, A, 'vehicles', vehicle!.id)))[0]!.id).toBe(photo.id)
    await expect(scoped(A, tx => photoFile(tx, A, 'properties', asset, photo.id))).rejects.toMatchObject({ status: 404 })
    await db.delete(schema.vehicles).where(eq(schema.vehicles.id, vehicle!.id))
    expect(await db.select().from(schema.catalogPhotos)).toHaveLength(0)
  })
})
