# Plata: dirección de producto y entregas

Decisiones acordadas el 12 de octubre de 2026.

## Meta

CRM para negocios rioplatenses que adapta sus procesos mediante preconfiguraciones
de nicho y un asistente de onboarding con la API de Anthropic. El asistente prepara
una propuesta editable y aplica la configuración tras aprobación. Publicaciones,
mensajes y otras acciones externas requieren autorización específica.

## Primera entrega: organizaciones y equipos

Implementada en la rama `codex/organizations-and-teams`, pendiente de publicación:

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

## Siguientes entregas

1. Inmobiliarias y automotor: propiedades/vehículos como entidades relacionadas con
   contactos y oportunidades; catálogo, interesados, responsables y visitas/pruebas.
2. Plantillas de nicho versionadas y onboarding con Anthropic: preguntas adaptativas,
   resumen editable, aplicación validada/idempotente, reanudación y conexiones pendientes.
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

## Publicación de la primera entrega

Ejecutar `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm type-check`, `pnpm build`.
Antes de mergear a main: backup recuperable, revisión de 0010 y comprobación de emails
en staging. El workflow de main aplica migraciones y despliega automáticamente.
La 0010 no debe revertirse volviendo al código single-org después de crear nuevas
membresías: exige una corrección hacia adelante. No eliminar membresías para revertir.
