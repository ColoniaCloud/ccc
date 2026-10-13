# Agenda y Google Calendar — piloto

La cuarta entrega reúne tareas, visitas inmobiliarias y pruebas de manejo en
`/app/agenda`. `/app/tasks` redirige allí. Las tareas pueden vincular contacto,
oportunidad y responsable; las citas conservan su ficha e interesado, admiten
duración de 15 a 480 minutos, reprogramación, realización y cancelación.
Owner, admin, manager y seller pueden trabajar en la agenda compartida.
Support tiene lectura y no conecta calendarios.

## Fechas y seguimiento

`tasks.due_on` es una fecha sin hora. La migración 0013 copia el día UTC que
guardaba `due_date`, sin reinterpretarlo en la zona del navegador. Se conserva
`due_date` como representación UTC para compatibilidad con clientes anteriores.
Las tareas vencen cuando su día es anterior al día actual de Uruguay. Las citas
guardan un instante UTC y duración; la agenda las muestra en America/Montevideo.
El formulario datetime-local avisa que utiliza la zona del dispositivo.

Una oportunidad abierta necesita al menos una tarea pendiente con fecha de hoy
o posterior, vinculada por deal_id, o una cita futura del mismo interesado y
propiedad/vehículo. La visita de otro interesado no satisface su seguimiento.
Las tareas sin fecha quedan visibles, pero no cuentan como próximo paso.
Una cita pasada pendiente se marca por resolver, no se completa automáticamente.

Las etapas tienen outcome open/won/lost. La migración identifica únicamente
los nombres existentes Ganado/Perdido (ignorando mayúsculas y espacios). Nuevos
procesos y plantillas asignan outcome explícitamente. Las etapas personalizadas
con otros nombres permanecen abiertas; revisar su significado durante el piloto.
Los contadores pertenecen a la organización; los filtros afectan la lista.

## Autorización de Google

La autorización del calendario es independiente del inicio de sesión con Google.
Puede usarse el mismo cliente OAuth del login o definir un cliente propio con
GOOGLE_CALENDAR_CLIENT_ID y GOOGLE_CALENDAR_CLIENT_SECRET. Una configuración
parcial de cliente propio se rechaza. No se reutilizan tokens del login.

Solicita exclusivamente `https://www.googleapis.com/auth/calendar.app.created`,
con acceso offline, state aleatorio guardado como SHA256, PKCE S256 y expiración
de diez minutos. La organización incluida en el state solo selecciona el contexto
RLS; el hash completo y la sesión autenticada validan la autorización. Se consume
una sola vez. Se revalidan usuario, miembro, rol y estado de la organización antes
y después del intercambio externo. Desconectar invalida las autorizaciones
pendientes, incluso si una respuesta de Google llega después.

Cada miembro autoriza su cuenta y obtiene un calendario secundario
«Plata · Nombre de organización». Solo se exportan citas asignadas a ese miembro:
título de la ficha, horario/duración y enlace al CRM. No se exportan nombres de
interesados, teléfonos, emails ni notas, ni se agregan invitados. No se envían
mensajes o invitaciones desde esta integración.

Google documenta este permiso y la creación de calendarios secundarios en
[Autorización](https://developers.google.com/workspace/calendar/api/auth) y
[calendars.insert](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert).
Los ids propios recuperan inserciones con respuesta perdida según
[events.insert](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

## Sincronización y recuperación

Plata es la fuente de los cambios. No se importan eventos ni modificaciones
hechas en Google. La primera conexión exporta citas futuras; no copia el historial.
Una cita ya exportada conserva su evento al completarse; al cancelarse, eliminarse
o reasignarse a otro miembro se borra de ese calendario. Reactivar una cita borrada
usa una generación nueva del id para respetar los tombstones de Google.

El proceso API ejecuta un worker cada 15 s cuando existe configuración válida.
Recorre organizaciones por tandas, toma leases en PostgreSQL y reconcilia hasta
diez cambios por conexión/ciclo. Una conexión sin cambios se revisa después de
60 s; los errores temporales se reintentan a los cinco minutos. Estado persistido,
ids deterministas y leases evitan duplicar eventos tras reinicios o entre procesos.
Las llamadas externas tienen timeout de 15 s y ocurren fuera de transacciones.
Cada evento renueva su lease de 90 s y revalida la conexión antes/después del envío.

Revocación o permisos insuficientes requieren reconectar. Si la respuesta al crear
el calendario es incierta, se pide reconectar en vez de crear repetidamente
calendarios: Google no admite idempotency keys en calendars.insert. Puede quedar
un calendario vacío que el usuario elimine en Google.

Desconectar destruye el refresh token guardado y detiene los próximos envíos.
Una petición que ya recibió Google puede terminar. Los calendarios/eventos que
ya están en Google quedan como copia; el usuario puede borrarlos allí. Reconectar
crea un calendario nuevo. Eliminar al miembro u organización elimina credenciales
por cascada; pasar a support detiene y elimina credenciales en el próximo ciclo.
Desconectar no revoca globalmente el cliente OAuth de Google, porque el mismo
cliente podría usarse para el login u otra organización.

## Habilitación en producción

El servidor verificado ya tiene el cliente OAuth del login. Antes de habilitar
Calendar, en el proyecto Google Cloud de ese cliente:

1. Habilitar Google Calendar API.
2. Incorporar el scope calendar.app.created a la pantalla de consentimiento.
3. Registrar el redirect URI exacto:
   `https://api.plata.studio/api/calendar/callback`.
   Para un cliente de desarrollo: `http://localhost:3001/api/calendar/callback`.
4. Para el piloto, registrar los usuarios de prueba si la app está en modo Testing.
   Validar sus condiciones de renovación de tokens antes del lanzamiento público.
5. Generar CALENDAR_ENCRYPTION_KEY (32 bytes aleatorios, 64 caracteres hex) y
   guardarlo en deploy/.env del VPS mediante un canal seguro. Respaldar esa clave
   junto con el procedimiento de recuperación; nunca enviarla por chat ni a Git.
6. Si se usa cliente propio, guardar ambos GOOGLE_CALENDAR_CLIENT_* en ese entorno.
7. Desplegar con backup previo de código/DB/entorno; aplicar 0013 y verificar
   FORCE RLS y permisos CRUD de plata_app en las tres tablas nuevas.
8. Cada usuario abre Agenda → Autorizar Google Calendar y acepta su consentimiento.
   Comprobar crear, reprogramar, reasignar y cancelar una cita ficticia.

Sin clave/cliente válido el botón indica que Plata aún debe habilitar la conexión;
la agenda funciona completamente. Cambiar la clave sin migrar el cifrado exige
reconectar usuarios; no rotarla accidentalmente durante un despliegue.

La implementación y las pruebas usan el contrato HTTP simulado de Google. La
prueba con cuentas reales queda pendiente de configurar Google Cloud y del
consentimiento de cada usuario. Los límites de consumo, monitoreo de backlog y
un worker separado se ajustarán después del piloto; esta implementación no es
un sistema de recordatorios comerciales ni una sincronización bidireccional.

## Piloto comercial

Probar con una inmobiliaria y una automotora elegidas por el usuario. Para cada
una: onboarding completado, ficha real, interesado, oportunidad, tarea con fecha
y responsable, visita/prueba, reprogramación, resultado y próximo seguimiento.
Medir tiempo hasta primera operación, oportunidades sin próximo paso y actividades
vencidas por semana. No activar campañas o mensajes automáticos para este piloto.
