import type { CatalogKind } from '@crm/shared'

export type CatalogRecord = { id: string; title: string; status: string; price: string | null;
  currency: string; sourceContactId: string | null; assignedTo: string | null; notes: string | null;
  [key: string]: string | number | null }
export type CatalogField = { key: string; label: string; type?: 'number' | 'select'; required?: boolean; options?: [string, string][]; min?: number; step?: string }
export const STATUS_LABELS: Record<string, string> = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido', rented: 'Alquilado', archived: 'Archivado' }
export const CURRENCY_OPTIONS: [string, string][] = ['USD','UYU','ARS','CLP','BRL'].map((value) => [value, value])
export const CATALOGS: Record<CatalogKind, { label: string; singular: string; appointment: string; fields: CatalogField[] }> = {
  properties: { label: 'Propiedades', singular: 'propiedad', appointment: 'visita', fields: [
    { key: 'title', label: 'Título', required: true },
    { key: 'operation', label: 'Operación', type: 'select', options: [['sale','Venta'],['rent','Alquiler']] },
    { key: 'propertyType', label: 'Tipo de propiedad', type: 'select', options: [['house','Casa'],['apartment','Apartamento'],['land','Terreno'],['commercial','Local comercial'],['office','Oficina'],['other','Otro']] },
    { key: 'address', label: 'Dirección', required: true }, { key: 'city', label: 'Ciudad', required: true },
    { key: 'region', label: 'Departamento o provincia' }, { key: 'bedrooms', label: 'Dormitorios', type: 'number', min: 0 },
    { key: 'bathrooms', label: 'Baños', type: 'number', min: 0 }, { key: 'area', label: 'Superficie (m²)', type: 'number', min: 0, step: '0.01' },
  ] },
  vehicles: { label: 'Vehículos', singular: 'vehículo', appointment: 'prueba de manejo', fields: [
    { key: 'title', label: 'Título', required: true }, { key: 'make', label: 'Marca', required: true },
    { key: 'model', label: 'Modelo', required: true }, { key: 'year', label: 'Año', type: 'number', required: true, min: 1886 },
    { key: 'mileage', label: 'Kilometraje', type: 'number', min: 0 }, { key: 'plate', label: 'Matrícula' },
    { key: 'stockType', label: 'Origen', type: 'select', options: [['owned','Propio'],['consignment','Consignado']] },
  ] },
}

export function catalogFields(kind: CatalogKind): CatalogField[] {
  return [...CATALOGS[kind].fields,
    { key: 'price', label: 'Precio', type: 'number', min: 0, step: '0.01' },
    { key: 'currency', label: 'Moneda', type: 'select', options: CURRENCY_OPTIONS },
    { key: 'status', label: 'Disponibilidad', type: 'select', options: Object.entries(STATUS_LABELS).filter(([key]) => kind === 'properties' || key !== 'rented') },
  ]
}

export function initialCatalogValues(kind: CatalogKind, item?: CatalogRecord) {
  return Object.fromEntries([...catalogFields(kind).map((field) => [field.key,
    item?.[field.key] != null ? String(item[field.key]) : field.options?.[0]?.[0] ?? '']),
    ['sourceContactId', item?.sourceContactId ?? 'none'], ['assignedTo', item?.assignedTo ?? 'none'], ['notes', item?.notes ?? '']]) as Record<string, string>
}

export function priceLabel(item: Pick<CatalogRecord, 'price' | 'currency'>) {
  return item.price == null ? 'Precio a consultar' : new Intl.NumberFormat('es-UY', { style: 'currency', currency: item.currency, maximumFractionDigits: 2 }).format(Number(item.price))
}
