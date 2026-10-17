# Agentes de Plata — primera entrega

## Alcance

Seguimiento comercial compartido por organización, disponible en `/app/agents`.
El propietario/admin crea un agente en pausa y define nombre, instrucciones,
proceso comercial (opcional) y umbral de 1–90 días sin actividad. Luego lo activa.
Las revisiones son manuales. La conversación explica los casos o prepara
borradores; no envía mensajes ni ejecuta las instrucciones como código.

Una oportunidad es elegible si sigue abierta, no tiene tareas pendientes y su
última actividad registrada supera el umbral. Se consideran modificaciones de
la oportunidad, actividad del contacto y tareas completadas de la oportunidad.
Las actividades fuera de Plata no pueden inferirse. Se revisan primero los casos
más antiguos, con límite por plan.

La revisión crea propuestas deterministas; la IA redacta el resumen. Aprobar una
propuesta crea una tarea para hoy (hora de Uruguay), vinculada a la oportunidad,
su contacto y responsable. Se revalida su estado antes de crearla. Una propuesta
que dejó de corresponder se marca `stale`, sin crear una tarea. Descartar una
propuesta no excluye permanentemente la oportunidad de revisiones futuras.

## Permisos y membresías

| Operación | Roles |
| --- | --- |
| Leer historial y propuestas | Todos los miembros |
| Crear, configurar, activar y archivar | owner, admin |
| Revisar oportunidades y conversar | owner, admin, manager, seller |
| Aprobar o descartar propuestas | owner, admin, manager |

Límites iniciales, definidos en `apps/api/src/agents/policy.ts`:

| Plan | Agentes no archivados | Consultas/mes | Casos/revisión |
| --- | ---: | ---: | ---: |
| Free | 0, demo local con ejemplos | 0 | 0 |
| Pro | 1 | 40 | 25 |
| Business | 3 | 150 | 50 |
| Master | 10 | 500 | 100 |
| Enterprise | 20 | 1000 | 100 |

Estos cupos son independientes del Asistente de configuración. Una consulta
equivale a una única llamada acotada al modelo (revisión o mensaje). Cada llamada
se reserva en la base antes de salir al proveedor. Los intentos fallidos o
interrumpidos conservan el consumo, porque el proveedor puede haberlos procesado.
Las validaciones rechazadas antes de reservar no consumen. El límite se renueva
por mes calendario en America/Montevideo, no en el aniversario de la suscripción.
La salida se limita a 1800 tokens; historial de contexto a los últimos 3 pares
de chat, de hasta 1500 caracteres cada mensaje. No hay bucle de herramientas.
Se registran tokens de entrada/salida; estos cupos no son presupuestos en dólares.

Solo una llamada de Agentes puede estar en curso por organización. Las reservas
vencen a los dos minutos, por encima del timeout del proveedor de 45 segundos.
Las lecturas/nuevas solicitudes recuperan reservas abandonadas marcándolas como
fallidas. Una respuesta que llega después del vencimiento no crea propuestas.

Al bajar de plan, solo los agentes más antiguos dentro del nuevo cupo pueden
ejecutarse. Los excedentes quedan bloqueados por membresía, conservando datos.
Archivar libera un cupo y descarta propuestas pendientes; el historial permanece
en la base (esta primera interfaz muestra únicamente agentes no archivados).
Aprobar propuestas no consume IA y sigue disponible al agotar consultas, siempre
que el agente esté dentro del cupo del plan.

## Integración técnica

- API Hono `/api/agents`: lista, creación, detalle, actualización, archivo,
  ejecución, conversación y decisión de propuestas.
- Migración `0017_agents`: tablas `agents`, `agent_jobs`, `agent_proposals`, RLS
  forzada, claves compuestas y unicidad de propuesta pendiente por oportunidad.
- Las operaciones usan `withTenant`; no se conserva una transacción abierta
  mientras responde Anthropic. Un lock del tenant serializa reservas y decisiones.
- Roles, estado de organización y membresía se verifican de nuevo al guardar
  la respuesta. Los permisos no dependen de lo que solicite el modelo.
- La IA recibe títulos de oportunidades y fecha de última actividad; no recibe
  emails, teléfonos, notas del contacto ni acceso libre a consultas SQL.
- Modelo: `ANTHROPIC_AGENTS_MODEL`, con fallback a
  `ANTHROPIC_ONBOARDING_MODEL` y al predeterminado del asistente existente.
  Requiere `ANTHROPIC_API_KEY`. No se exponen estas variables al navegador.

## Validación y publicación

Las pruebas del servicio usan PostgreSQL en WASM (PGlite), todas las migraciones,
rol sin BYPASSRLS y proveedor de IA simulado. No usan datos ni credenciales de
producción. Incluyen aprobación repetida, aislamiento, acceso cruzado, cambio de
rol durante una llamada, límites de plan, consumo separado, recuperación de
interrupciones y exclusión de oportunidades con actividad o tareas.

Antes de publicar: ejecutar `pnpm type-check`, `pnpm test` y `pnpm build`; respaldar
la base según el procedimiento del proyecto y aplicar la migración mediante el
despliegue habitual. No ejecutar `db:push` contra producción. La primera prueba
del proveedor real debe hacerse con una organización de prueba y datos ficticios.

Quedan para otra entrega: programación, otros tipos de agente, envío por canales
externos, edición del borrador de tarea antes de aprobar, navegación de archivos
y paginación del historial (se muestran las últimas 50 llamadas y 200 propuestas,
priorizando las pendientes).
