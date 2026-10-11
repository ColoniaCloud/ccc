import type {
  BusinessIndustry,
  BusinessCountry,
  BusinessTeamSize,
  BusinessSalesChannel,
  BusinessSalesCycle,
  BusinessGoal,
} from '@crm/shared'

// Etiquetas del formulario "Datos del negocio". `Record<Union, string>` hace
// que TypeScript falle si @crm/shared agrega un valor y acá falta su etiqueta.
// El orden de las claves es el orden en que se muestran.

export const INDUSTRY_LABELS: Record<BusinessIndustry, string> = {
  retail:        'Comercio / tienda',
  services:      'Servicios profesionales',
  automotive:    'Automotor',
  real_estate:   'Inmobiliaria',
  health:        'Salud y bienestar',
  education:     'Educación',
  food:          'Gastronomía',
  construction:  'Construcción',
  manufacturing: 'Industria / fabricación',
  technology:    'Tecnología / software',
  wholesale:     'Distribución / mayorista',
  other:         'Otro',
}

export const COUNTRY_LABELS: Record<BusinessCountry, string> = {
  UY: 'Uruguay',
  AR: 'Argentina',
  CL: 'Chile',
  BR: 'Brasil',
  PY: 'Paraguay',
  MX: 'México',
  CO: 'Colombia',
  PE: 'Perú',
  ES: 'España',
  other: 'Otro',
}

export const TEAM_SIZE_LABELS: Record<BusinessTeamSize, string> = {
  'solo':  'Solo yo',
  '2-5':   '2 a 5 personas',
  '6-20':  '6 a 20 personas',
  '21-50': '21 a 50 personas',
  '50+':   'Más de 50',
}

export const SALES_CHANNEL_LABELS: Record<BusinessSalesChannel, string> = {
  whatsapp:    'WhatsApp',
  instagram:   'Instagram',
  facebook:    'Facebook',
  store:       'Local físico',
  web:         'Sitio web / e-commerce',
  phone:       'Teléfono',
  email:       'Email',
  field:       'Vendedores en la calle',
  marketplace: 'Marketplaces',
}

export const SALES_CYCLE_LABELS: Record<BusinessSalesCycle, string> = {
  immediate: 'Inmediato (el mismo día)',
  days:      'Días',
  weeks:     'Semanas',
  months:    'Meses',
}

export const GOAL_LABELS: Record<BusinessGoal, string> = {
  organize_contacts: 'Ordenar mis contactos y clientes',
  follow_up:         'No perder seguimientos',
  sell_more:         'Vender más',
  team:              'Coordinar a mi equipo de ventas',
  metrics:           'Medir resultados',
}
