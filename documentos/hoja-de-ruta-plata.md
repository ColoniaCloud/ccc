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

Publicada en `main` y en el VPS, commit `713d0fd`:

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
El asistente con Anthropic utiliza este motor en la tercera entrega.

Validación de esta entrega: 95 pruebas automatizadas, type-check y build del monorepo;
PostgreSQL local con rol sin bypass y navegador real para aplicar las tres plantillas,
editar/archivar/recuperar fichas, crear oportunidades, realizar/cancelar citas, comprobar
aislamiento y lectura de support. Vista móvil verificada a 360 px. Datos exclusivamente
de prueba, sin llamadas a Anthropic ni servicios externos en esa entrega.

Publicación verificada el 13 de octubre: [CI](https://github.com/ColoniaCloud/ccc/actions/runs/38331001082)
y [Deploy VPS](https://github.com/ColoniaCloud/ccc/actions/runs/38331112462) exitosos;
web/API saludables, hash de 0011 aplicado y FORCE RLS/permisos CRUD comprobados
con `plata_app` sin superuser ni BYPASSRLS. Backup previo restaurado en una base
descartable: `/root/backups/plata-20261013T011142Z-pre-niches/` (dump y bundle Git).

## Tercera entrega: onboarding con Anthropic

Implementada en `codex/anthropic-onboarding`, pendiente de publicación:

- Primera visita de organizaciones nuevas: asistente para owner/admin. Las organizaciones
  existentes conservan el acceso al CRM; pueden iniciar el asistente voluntariamente.
- Usa el perfil del registro y preguntas adaptativas para inmobiliarias/automotor.
  Conversación por organización, reanudación y opción de configurar después.
- Propuesta editable: resumen, selección de procesos, acciones recomendadas y herramientas
  pendientes. Revisión de cambios concretos antes de aprobar la configuración conjunta.
- Reutiliza el motor de plantillas. Una aprobación vieja o un conflicto impide aplicar
  cambios; todos los procesos se aplican juntos en una transacción, sin sobrescribir datos.
- Las conexiones quedan pendientes. No se ejecutan mensajes, publicaciones, contratos,
  operaciones financieras ni conexiones OAuth en esta entrega.
- API de Anthropic exclusivamente desde el servidor, con `ANTHROPIC_API_KEY` y modelo
  configurable `ANTHROPIC_ONBOARDING_MODEL` (default `claude-haiku-5-5`, disponible en
  la cuenta verificada). SDK existente, sin nueva dependencia. El modelo debe admitir
  tool_choice con herramienta nombrada: se exige responder con una propuesta estructurada.
- Una llamada activa por organización, timeout de 60 s, lease de recuperación de 120 s,
  sin reintentos automáticos y hasta 20 generaciones por preparación. Es un límite
  técnico del piloto, no una cuota comercial por plan. Uso de tokens registrado.
- Migración 0012 aditiva: sesiones con FORCE RLS y `setup_required=false` por defecto;
  solo las altas nuevas lo marcan true. No obliga a equipos existentes a repetir onboarding.
- 114 pruebas automatizadas, incluyendo protocolo de respuestas de Anthropic y PostgreSQL.
  Prueba real en navegador con Anthropic para ambos nichos: alta, primera visita, preguntas,
  propuesta, edición, reanudación, aprobación vencida, aplicación y móvil a 360 px.
  Se enviaron exclusivamente perfiles y conversaciones ficticias de prueba.

Antes de publicar: repetir type-check/build y preparar backup de ese momento. La API key
no viaja al navegador ni se escribe en el repositorio. Las pruebas locales usan la clave
en memoria del proceso y una base local separada de producción.

## Siguientes entregas

1. Piloto del onboarding: revisar finalización y primera operación con negocios reales;
   ampliar plantillas/personalización según esas observaciones y definir cuotas por plan.
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
Antes de mergear la tercera entrega a main: backup recuperable de ese momento,
revisión de 0012 y validación de permisos del rol de aplicación. El workflow de main
aplica migraciones y despliega automáticamente. El backup de la primera entrega se
tomó después de publicarla y se verificó restaurándolo en una base descartable;
no reemplaza el backup previo verificado de la segunda entrega ni uno previo a la tercera.
La 0010 no debe revertirse volviendo al código single-org después de crear nuevas
membresías: exige una corrección hacia adelante. No eliminar membresías para revertir.
