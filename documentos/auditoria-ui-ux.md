# Auditoría UI/UX — Plata CRM

Fecha: 13 de septiembre de 2026

## Resumen ejecutivo

La aplicación tiene una base funcional coherente para un MVP: autenticación, onboarding, contactos, importación CSV, pipeline, tareas, facturación, configuración y administración. El principal límite no está en la funcionalidad sino en la capa de producto: las pantallas fueron resueltas de forma independiente y todavía no forman una experiencia unificada.

El rediseño debe priorizar claridad operativa, consistencia y velocidad de uso. La dirección propuesta es un CRM oscuro, sobrio y de alta densidad controlada, con el cian de Plata reservado para foco, progreso y acciones principales.

## Hallazgos principales

### 1. Navegación y arquitectura de información

- La navegación anterior estaba ubicada a la derecha, sin iconos, grupos ni contexto de cuenta.
- El estado activo solo funcionaba con coincidencias exactas; una ficha de contacto no mantenía “Contactos” seleccionado.
- No existía una navegación móvil completa.
- El cierre de sesión ocupaba espacio permanente en el header y no había un menú de cuenta.

Estado: resuelto en la primera vertical del rediseño con sidebar izquierda, agrupación, iconografía, coincidencia por subruta, modo colapsado persistente y drawer móvil.

### 2. Dashboard

- La vista inicial mostraba tres cifras sin tendencia, contexto ni siguiente acción.
- La información de organización competía visualmente con los indicadores comerciales.
- No había acceso directo a las tareas próximas, la distribución del pipeline o los contactos recientes.

Estado: resuelto con cuatro indicadores, lectura del pipeline por etapa, tareas próximas, contactos recientes y acciones rápidas.

### 3. Sistema de componentes

- El repositorio tiene shadcn/ui configurado con Radix Nova y Hugeicons, pero la app autenticada todavía usa mayormente HTML y CSS manual.
- Se detectaron 72 controles HTML directos y 55 estilos inline en las 20 páginas del frontend.
- Botones, formularios, tablas, badges, toggles y estados vacíos tienen implementaciones paralelas.
- `app.css` concentra estilos de dominios distintos, dificultando mantener y evolucionar una sola pantalla.

Recomendación: migrar por flujo, no por componente aislado. Cada flujo migrado debe reemplazar todos sus controles, feedback y estados a la vez.

### 4. Feedback y prevención de errores

- Varias eliminaciones se ejecutan inmediatamente: deals, tareas, contactos individuales y campos personalizados.
- Solo la eliminación masiva de contactos pide confirmación.
- Las mutaciones no comparten una estrategia de toast, undo o confirmación.
- Algunos errores se muestran dentro del layout y otros como texto suelto.

Recomendación: usar confirmación para entidades de alto impacto y toast con “Deshacer” para tareas o acciones reversibles.

### 5. Estados de carga y vacíos

- Predomina el texto “Cargando…” sin conservar la estructura de la pantalla.
- Los estados vacíos explican qué falta, pero generalmente no ofrecen una acción primaria.
- No hay una estrategia homogénea de error parcial frente a error de página completa.

Recomendación: skeletons estructurales, estados vacíos con CTA y errores acotados al bloque que falló.

### 6. Contactos

- Alta capacidad funcional, pero el formulario de alta permanece abierto y desplaza la tabla.
- Filtros, altas, acciones masivas y tabla compiten en una sola superficie.
- La tabla depende de scroll horizontal en pantallas angostas.
- La ficha de contacto acumula datos, etiquetas, campos personalizados, notas y actividad sin navegación interna.

Recomendación: alta en sheet lateral, toolbar compacta, tabla con menú de acciones y ficha organizada en resumen + tabs de actividad/datos.

### 7. Pipeline

- El kanban representa las etapas, pero mover una oportunidad depende de un select dentro de cada tarjeta.
- Crear un deal ocupa un panel permanente sobre el tablero.
- Las columnas no muestran valor acumulado ni señales de estancamiento.

Recomendación: sheet de creación, drag and drop accesible como mejora progresiva, totales por etapa y tarjetas con acciones en menú contextual.

### 8. Tareas

- El flujo es simple y funcional, pero no separa vencidas, hoy, próximas y completadas.
- Eliminar una tarea es una acción inmediata y permanente.
- Faltan filtros y asociaciones visibles con contacto/deal aunque el backend ya soporta esas relaciones.

Recomendación: agrupación temporal, filtros rápidos y contexto de la entidad asociada.

### 9. Facturación y ajustes

- La comparación de planes no comunica diferencias de capacidades.
- Acciones de pago y cancelación necesitan mayor jerarquía y confirmación.
- Ajustes tiene una navegación secundaria correcta conceptualmente, pero poco integrada con la shell.

Recomendación: tabla de comparación progresiva, resumen de suscripción y tabs/side navigation construidos con el mismo sistema de componentes.

### 10. Marketing, auth y onboarding

- Marketing y auth ya adoptan parcialmente shadcn y están más cerca del sistema objetivo.
- La experiencia pública y la app comparten marca, pero difieren en densidad y estructura.
- El onboarding es demasiado breve para enseñar el valor del primer contacto, deal y tarea.

Recomendación: conservar la expresividad de marketing y agregar un checklist contextual dentro de la app para completar la activación real.

## Plan recomendado

### Fase 1 — Fundaciones y home

- Shell, navegación, cuenta y responsive.
- Dashboard operativo.
- Tokens y convenciones compartidas.

Estado: implementada en esta entrega.

### Fase 2 — Flujo comercial principal

- Contactos y ficha de contacto.
- Pipeline y creación/edición de deals.
- Confirmaciones, toast y estados vacíos compartidos.

### Fase 3 — Productividad y administración

- Tareas con agrupación temporal.
- Configuración, módulos y campos personalizados.
- Facturación y panel de administración.

### Fase 4 — Activación y crecimiento

- Auth y onboarding guiado.
- Landing y páginas de conversión.
- Instrumentación de eventos para medir activación, adopción y abandono.

## Criterios de aceptación para las siguientes fases

- Navegación completa por teclado y foco siempre visible.
- Ninguna acción destructiva irreversible sin confirmación o mecanismo de undo.
- Todos los flujos con loading, vacío, error y éxito explícitos.
- Sin nuevos estilos inline salvo valores verdaderamente dinámicos, como color y ancho de una etapa.
- Componentes existentes de shadcn antes de crear primitivas nuevas.
- Responsive validado en 360 px, 768 px, 1280 px y 1440 px.
