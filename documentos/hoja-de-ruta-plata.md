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

Publicada en `main` y en el VPS, merge `fc189f6` ([PR #1](https://github.com/ColoniaCloud/ccc/pull/1)):

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

Publicación verificada el 13 de octubre: [CI](https://github.com/ColoniaCloud/ccc/actions/runs/38366347387)
y [Deploy VPS](https://github.com/ColoniaCloud/ccc/actions/runs/38366519187) exitosos.
Hash de 0012, FORCE RLS/permisos y rol de aplicación sin bypass comprobados.
Backup previo restaurado: `/root/backups/plata-20261013T075951Z-pre-onboarding/`.
La API key no viaja al navegador ni se escribe en el repositorio. Las pruebas locales
usan la clave en memoria del proceso y una base local separada de producción.

## Cuarta entrega: agenda y seguimiento

Publicada en `main` y en el VPS, merge `57f486c` ([PR #2](https://github.com/ColoniaCloud/ccc/pull/2)):

- Agenda compartida de tareas, visitas y pruebas de manejo. Filtros por responsable,
  tipo y fechas; vencidos, historial y oportunidades sin próximo paso.
- Tareas con contacto, oportunidad, responsable y vencimiento como fecha sin hora.
  Acceso desde el pipeline para planificar el seguimiento, con datos precargados.
- Citas con duración, reprogramación y reasignación; realización/cancelación.
  La visita de otro interesado no oculta una oportunidad sin seguimiento.
- Conector de Google Calendar por miembro: OAuth independiente del login, permiso
  calendar.app.created, tokens cifrados, PKCE y estados consumibles una sola vez.
- Sincronización de citas asignadas hacia un calendario propio de Plata, con leases,
  ids estables, reintentos y cancelaciones. Sin invitados, mensajes ni datos de contactos.
- Migración 0013 aditiva: fechas, duraciones, outcome de etapas, tres tablas de Calendar
  con FORCE RLS, permisos de plata_app y relaciones por organización.
- 140 pruebas automatizadas, incluyendo RLS, fechas y seguimiento, protocolo HTTP
  de Google, revocación, respuestas tardías y recuperación de eventos. Navegador con
  PostgreSQL local: alta/edición de tareas, seguimiento, reprogramación/cancelación,
  lectura de support, aislamiento y vista móvil de 360 px.

Publicación verificada el 13 de octubre: [CI](https://github.com/ColoniaCloud/ccc/actions/runs/38403341562)
y [Deploy VPS](https://github.com/ColoniaCloud/ccc/actions/runs/38403604706) exitosos.
Migración 0013, FORCE RLS/permisos y lectura de las seis organizaciones comprobados.
Backup previo restaurado: `/root/backups/plata-20261013T131248Z-pre-agenda/`, con
código, DB y copia privada del entorno. Clave de cifrado generada en el VPS y respaldada;
Calendar configurado en runtime, callback registrado y verificado en Google Cloud;
permiso calendar.app.created declarado y guardado en la pantalla de consentimiento.
El consentimiento de cada cuenta y la primera sincronización real siguen pendientes.
Procedimiento y límites del piloto en [agenda-calendar.md](agenda-calendar.md).

## Quinta entrega: recorrido de activación del piloto

Publicada en main (`a8159f2`) y verificada en producción:

- El resumen muestra los cinco pasos para poner en marcha inmobiliarias/automotor:
  configuración, ficha, contacto, oportunidad vinculada y seguimiento con fecha/responsable.
- El avance se deriva de registros actuales bajo RLS. Visitar una pantalla no completa
  un paso; una plantilla sola no equivale a una primera operación comercial.
- El seguimiento puede probarse con una tarea/cita válida o una oportunidad ya cerrada,
  evitando exigir nuevas acciones a negocios que ya llegaron al resultado.
- Google Calendar es opcional y personal: estar conectado no prueba una cita sincronizada.
- El recorrido completo se resume; los vencidos y oportunidades sin próximo paso siguen
  visibles. Support tiene lectura; la configuración se deriva al propietario/admin.
- Sin nuevas migraciones, llamadas a IA, invitaciones ni datos de producción ficticios.
- 145 pruebas, incluidas las condiciones de avance y el aislamiento del calendario.

Este avance representa la situación de los datos conservados. No es una bitácora
histórica ni una medición de retención; al eliminar los registros de prueba puede
retroceder. El piloto con negocios reales requiere elegir sus organizaciones y que
cada participante autorice las conexiones que utilice.

Publicación: [Deploy VPS](https://github.com/ColoniaCloud/ccc/actions/runs/38413581426)
exitoso tras reintentar una conexión SSH que agotó el tiempo antes de ejecutar comandos.
Backup previo restaurado: `/root/backups/plata-20261013T142412Z-pre-activation/`.

## Sexta entrega: medición del piloto

Publicada en PR #4, merge `ea1f8f0`, con despliegue y migración 0014 verificados:

- Inicio explícito por propietario/admin o al intentar la primera escritura comercial.
  Consultar pantallas no inicia la medición. Una solicitud rechazada no suma actividad.
- Línea de base antes de modificar registros: los hitos existentes se identifican como
  anteriores, sin inventar fechas históricas ni duración de activación.
- Primera comprobación de cada hito conservada; no retrocede al eliminar registros.
  Onboarding aprobado se distingue del recorrido comercial completo.
- Acciones comerciales aceptadas y días activos por organización, con cuatro semanas
  de lunes a domingo en hora de Uruguay. Una importación cuenta una solicitud.
  No constituye medición de sesiones, retención de usuarios o frecuencia de login.
- Métricas agregadas sin nombres, emails, IPs ni contenidos; lectura solo propietario/admin.
  Cambiar el rubro pausa la actividad para no mezclar poblaciones.
- Migración 0014 con tres tablas, FORCE RLS, permisos y eliminación en cascada.
- 153 pruebas automatizadas, tipos y compilación correctos. Navegador local con
  PostgreSQL: recorrido completo, duración, hitos tras borrar, denegación a support,
  aislamiento y pantalla móvil de 360 px con selección de proceso.
- El resumen comercial excluye cierres de los negocios abiertos y del importe activo
  en USD, y permite elegir el proceso que grafica con un conteo coherente.

## Septima entrega: fotos privadas del catalogo

Publicada en PR #5, merge `08e10e9`, con despliegue, migración 0015 y procesamiento de imágenes verificados:

- Galeria en el detalle de propiedades y vehiculos: carga multiple, ampliacion,
  portada, orden y eliminacion confirmada. Support solo tiene lectura.
- Imagenes optimizadas a WebP sin EXIF/GPS, con limites de carga, dimensiones,
  cantidad, almacenamiento por organizacion y concurrencia de procesamiento.
- Bytes y metadatos persistidos en PostgreSQL; backups existentes incluyen fotos.
  Migracion 0015 con FORCE RLS, FKs compuestos y eliminacion en cascada.
- Acceso autenticado, respuestas privadas y sin enlaces publicos compartibles.
- Pruebas de seguridad, orientacion, orden, limites, rollback, ambos catalogos y
  pantalla movil de 360 px. Detalles operativos en [catalogo-fotos.md](catalogo-fotos.md).

## Octava entrega: Tu día

Publicada en PR #6, merge `2dbf30d` y corrección Node 20 `62c79be`, con CI y despliegue verificados:

- Foco personal por defecto, con filtros de todo el equipo, otro responsable y sin asignar.
- Tareas vencidas, de hoy y sin fecha; citas en curso o próximas hasta seis días después
  de hoy; citas terminadas sin resolver; oportunidades sin próximo paso.
- Lee la Agenda existente y mantiene sus permisos. Actualiza cada minuto mientras
  la página está visible, al volver a ella y mediante un botón explícito.
- Enlaces conservan organización, responsable y sección; permiten editar la tarea,
  reprogramar la cita o crear seguimiento para la oportunidad. Support solo lee.
- Una cita en curso mantiene el seguimiento y no vence hasta terminar su duración,
  con la misma regla en Agenda, activación y Tu día.
- Sin migraciones, emails, permisos OAuth adicionales ni llamadas a IA.

## Novena entrega: onboarding personalizado

Publicada mediante PR #7 en main `a0b6af5`, con backup restaurado de prueba y salud verificada en producción:

- Anthropic puede proponer un proceso adaptado por plantilla elegida, con nombre,
  una a ocho etapas abiertas y dos cierres que mantienen resultados ganado/perdido.
- Hasta ocho campos opcionales de contacto: texto, número, fecha, sí/no o lista.
  No se habilitan campos dinámicos de propiedades, vehículos u oportunidades.
- El usuario edita la propuesta y revisa los procesos, tipos, opciones y conflictos
  antes de aprobar. Cambios de configuración invalidan la aprobación anterior.
- Si la plantilla ya fue aplicada, se agrega otro proceso: se conservan IDs, etapas,
  contactos, oportunidades y personalizaciones existentes. Los campos compatibles
  se reutilizan; los conflictos requieren corregir la propuesta.
- Ajustar mi CRM retoma el asistente para propietario/admin, conservando mensajes,
  uso acumulado y el límite técnico de veinte consultas, sin resetearlo al reabrir.
- La IA recibe solamente metadatos acotados de configuración, no valores ni registros
  de contactos. Las llamadas siguen fuera de las transacciones PostgreSQL.
- Se usan los JSON existentes, sin nuevas migraciones ni dependencias. Una aprobación
  conjunta se aplica atómicamente y cuenta una acción de actividad del piloto.

## Décima entrega: cuotas mensuales de IA

Implementada en `codex/ai-plan-quotas`, pendiente de publicación:

- Límites aprobados por organización: Free 10, Pro 40, Business 100, Master 250 y Enterprise 500; renovación mensual a medianoche de Uruguay.
- Reserva atómica antes del proveedor, incluso ante fallos, y registro idempotente de tokens conocidos en el mes original. No consume un rechazo previo de permisos o validación.
- Resumen en onboarding y Facturación; agotarse la cuota permite seguir editando y aplicando manualmente.
- Reemplaza el límite vitalicio de veinte intentos, preservando conversación y contadores históricos. Nueva contabilidad desde el despliegue, sin cobro ni cambios de precios.
- Migración 0016 con RLS forzada, configuración por entorno y documentación en `documentos/cuotas-ia.md`.

## Siguientes entregas

1. Piloto del onboarding: revisar finalización y primera operación con negocios reales;
   ampliar plantillas/personalización según esas observaciones y revisar el consumo de las cuotas aprobadas.
2. Mejoras del catálogo según el piloto: fotos y recordatorios;
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
usuarios y cuotas de consumo de IA/integraciones; las cuotas del asistente ya están aprobadas, otros límites y precios quedan por definir.

## Publicación y revisión

Ejecutar `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm type-check`, `pnpm build`.
Antes de publicar una entrega: backup recuperable de ese momento, revisión de
las migraciones que incluya y validación de permisos del rol de aplicación. El workflow de main
aplica migraciones y despliega automáticamente. El backup de la primera entrega se
tomó después de publicarla y se verificó restaurándolo en una base descartable;
no reemplaza los backups previos verificados de las entregas siguientes.
La 0010 no debe revertirse volviendo al código single-org después de crear nuevas
membresías: exige una corrección hacia adelante. No eliminar membresías para revertir.
