# Plata: dirección de producto y entregas

Decisiones acordadas el 12 de octubre de 2026.

## Meta

CRM para negocios rioplatenses que adapta sus procesos mediante preconfiguraciones
de nicho y un asistente de onboarding con la API de Anthropic. El asistente prepara
una propuesta editable y aplica la configuración tras aprobación. Publicaciones,
mensajes y otras acciones externas requieren autorización específica.

## Primera entrega: organizaciones y equipos

Publicada en `main` y en el VPS, commit `ec2d34b`:

- Múltiples organizaciones por cuenta y selector; creación de otra organización.
- Invitación por email verificado, aceptación con cuenta nueva/existente, vencimiento,
  cancelación y reemplazo de links anteriores. Tokens almacenados solo como hashes.
- Owner, administrador, responsable comercial, vendedor y lectura. Gestión de miembros,
  cambios de rol, salida y transferencia de propiedad con confirmación.
- Migración 0010 conserva datos y asigna un propietario a cada equipo existente.
- Eliminación de cuenta compatible con todas sus organizaciones.
- 76 pruebas automatizadas, incluyendo PostgreSQL en memoria (PGlite); type-check y build.
- Validación en navegador con PostgreSQL local: invitación, registro, verificación en otra
  sesión, aceptación, selector, transferencia, permisos y vista móvil de 360 px.
  No se usan credenciales ni datos de producción en estas pruebas.

La cartera es compartida dentro de cada organización. Manager y seller tienen hoy las
mismas capacidades comerciales; la asignación/visibilidad por vendedor será otra entrega.
Los límites de usuarios por plan todavía no están definidos y esta entrega no inventa cuotas.

## Segunda entrega: catálogos y preconfiguraciones

Implementada en `codex/niche-catalogs-and-presets`, para revisar localmente antes de publicar:

- Propiedades: venta/alquiler, tipo, ubicación, dormitorios, baños, superficie,
  precio/moneda, propietario y responsable.
- Vehículos: marca, modelo, año, kilometraje, matrícula, propio/consignado,
  precio/moneda, vendedor o consignante y responsable.
- Fichas con búsqueda y disponibilidad; edición, archivo y recuperación.
  Archivar conserva las oportunidades y las citas anteriores.
- Una oportunidad puede relacionarse con una propiedad o un vehículo de su organización.
  Selector de procesos comerciales, responsable y acceso a la ficha desde el pipeline.
- Visitas/pruebas de manejo con interesado, fecha/hora, responsable y notas;
  marcación como realizada/cancelada. No se envían recordatorios en esta entrega.
- Plantillas v1 para venta inmobiliaria, alquiler y venta automotriz. Cada una agrega
  un proceso independiente y habilita su catálogo. Los campos de interés del contacto
  son opcionales; venta y alquiler reutilizan campos compatibles.
- Vista previa sin cambios, aprobación explícita y huella de la configuración revisada.
  Los conflictos o una revisión vencida bloquean la aplicación. La aplicación completa
  es transaccional; repetirla no duplica ni sobrescribe personalizaciones posteriores.
- Migración 0011 aditiva: cuatro tablas con FORCE RLS, permisos para `plata_app` y
  claves foráneas por organización para vínculos de activos. No modifica datos existentes.

Las plantillas las revisa/aplica el propietario o un administrador. Manager y seller
pueden trabajar en catálogos, oportunidades y citas; support conserva lectura.
No hay carga de fotos, portal público, agenda global ni recordatorios automáticos todavía.
Las plantillas se aplican manualmente desde Configuración → Preconfiguraciones;
el asistente con Anthropic se construye sobre este motor en la siguiente entrega.

Validación de esta entrega: 95 pruebas automatizadas, type-check y build del monorepo;
PostgreSQL local con rol sin bypass y navegador real para aplicar las tres plantillas,
editar/archivar/recuperar fichas, crear oportunidades, realizar/cancelar citas, comprobar
aislamiento y lectura de support. Vista móvil verificada a 360 px. Datos exclusivamente
de prueba, sin llamadas a Anthropic ni servicios externos.

## Siguientes entregas

1. Onboarding con Anthropic: preguntas adaptativas, propuesta editable basada en las
   plantillas, aplicación validada/idempotente, reanudación y conexiones pendientes.
   Reutilizar la API configurada en el entorno de Plata sin exponer claves al navegador.
2. Mejoras del catálogo según el piloto: fotos, agenda general y recordatorios;
   ampliar atributos y procesos a partir del uso real de inmobiliarias y automotor.
3. MarketDeck v1: Instagram y páginas de Facebook, contenido aprobado, programación,
   métricas y consultas vinculadas al CRM, sujeto a permisos y validación de APIs.
   WhatsApp queda para la siguiente entrega; no se promete generación de leads desde
   toda interacción ni publicación sin autorización.
4. Plata Web: sitios desde plantillas con catálogos y formularios conectados al CRM.
5. LeadDeck: prospección B2B tras validar licencias, almacenamiento, costos y contacto.
6. PlataNet: colaboración explícita entre inmobiliarias/automotor, con oferta/demanda
   compartida voluntariamente y carteras privadas por defecto frente a otros negocios.

El piloto excluye contratos, facturación fiscal, administración de alquileres,
financiación y gestión de taller. Métricas: finalización de onboarding, primera operación,
uso semanal y oportunidades atribuibles a MarketDeck. Planes: separar herramientas,
usuarios y cuotas de consumo de IA/integraciones; precios y límites quedan por definir.

## Publicación y revisión

Ejecutar `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm type-check`, `pnpm build`.
Antes de mergear la segunda entrega a main: backup recuperable de ese momento,
revisión de 0011 y validación de permisos del rol de aplicación. El workflow de main
aplica migraciones y despliega automáticamente. El backup de la primera entrega se
tomó después de publicarla y se verificó restaurándolo en una base descartable;
no reemplaza un backup previo a la segunda entrega.
La 0010 no debe revertirse volviendo al código single-org después de crear nuevas
membresías: exige una corrección hacia adelante. No eliminar membresías para revertir.
