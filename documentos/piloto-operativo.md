# Piloto operativo: inmobiliaria y automotora

Estado: preparado para ejecutar con dos negocios reales; la verificación local no constituye validación comercial. No se envían invitaciones ni se seleccionan clientes automáticamente.

## Participantes y duración

Una inmobiliaria y una automotora, cada una con su propia organización y un propietario responsable. Propuesta: siete días de uso y revisión al cierre; las fechas se acuerdan con los negocios. Iniciar en espacios nuevos permite medir el recorrido; los datos existentes se marcan como baseline y no prueban conversión durante el piloto.

## Recorrido acompañado

1. Registrar al propietario, crear la organización y completar el rubro, oferta, canales y objetivo. Verificar que cambiar de organización conserva sus datos separados.
2. Abrir Preparar mi CRM: explicar el proceso comercial y solicitar una propuesta. Revisar etapas, cierres ganado/perdido, campos opcionales y conexiones pendientes. Corregir lo necesario y aprobar. Las herramientas mencionadas no quedan conectadas automáticamente.
3. Confirmar en procesos y contactos los cambios aprobados. Abrir Ajustar mi CRM y comprobar que las modificaciones existentes se conservan; no reaprobar otra configuración sin revisar los cambios.
4. Inmobiliaria: cargar una propiedad y sus fotos. Automotora: cargar un vehículo y sus fotos. Crear un contacto, vincular una oportunidad con esa ficha y programar una tarea o cita con responsable.
5. Abrir Tu día y Agenda para encontrar el seguimiento. Google Calendar es opcional: cada persona autoriza su propia cuenta y se comprueba la sincronización después de consentir. La conexión pendiente no bloquea el piloto del CRM.
6. Invitar a un colaborador con el rol adecuado. Aceptar la invitación con su propia cuenta y verificar permisos. Un usuario support debe poder consultar sin modificar; no compartir contraseñas.
7. Revisar cuota en onboarding y Facturación: consumo compartido, renovación del primer día del mes en Uruguay y edición manual disponible al agotarse. No agotar cuotas reales como prueba técnica; ese bloqueo ya se comprobó localmente.
8. Al cierre de cada sesión, descargar el informe desde Medición del piloto en el inicio. El JSON conserva hitos observados, las últimas cuatro semanas y cuota del mes. La descarga no inicia medición ni altera datos.

## Registro de observaciones

Para cada negocio registrar: rubro, fecha acordada, paso que pudo completar sin ayuda, punto de confusión, corrección necesaria y próxima acción. Describir el problema sin copiar contactos, conversaciones ni credenciales. Conservar los JSON en una carpeta privada separada por negocio y fecha. El archivo no incluye nombres de clientes, pero contiene métricas internas del negocio.

## Criterios propuestos de salida

- Ambos propietarios aprueban la configuración y realizan el recorrido ficha → contacto → oportunidad → seguimiento con sus datos separados.
- No quedan fallos de permisos, pérdida de datos o bloqueos del flujo principal. Si aparecen, corregirlos antes de ampliar el piloto.
- Cada negocio vuelve a registrar una acción comercial en al menos dos días distintos de la semana. Es un objetivo de validación, no un resultado ya alcanzado.
- Revisar si diez consultas Free alcanzan para preparar el CRM; comparar consumo e incidencias antes de ajustar límites o proponer cambios de precios.
- Separar lo observado durante el piloto de los hitos baseline. Una acción registrada no equivale a una venta; los tokens conocidos no equivalen al costo facturado por Anthropic.

## Siguiente decisión

Tras revisar ambos recorridos, priorizar los obstáculos repetidos de onboarding y catálogo. Iniciar MarketDeck v1 cuando el flujo comercial principal y la recurrencia estén validados; los permisos de Meta y la publicación requieren su propia implementación y validación.

## Ejecución técnica con demos

Por indicación del usuario, el 14 de octubre de 2026 (Uruguay) se ejecutó el recorrido en `inmobiliaria-demo` y `automotora-demo` del entorno local. Ambas completaron cinco de cinco pasos de activación con ficha, foto de prueba, contacto ficticio, oportunidad vinculada y tarea de seguimiento con fecha y responsable. Se comprobó la presencia del seguimiento en Tu día y se descargó el informe de cada organización.

Los registros nuevos llevan el prefijo «Piloto demo» y se conservaron para revisión. Son sintéticos. Calendar está desconectado en ambas demos y no se realizaron llamadas a Anthropic en esta ejecución; el consumo mensual fue cero. El resultado valida el recorrido comercial existente y la exportación, no una nueva conversación con IA, invitaciones reales, sincronización de Calendar ni recurrencia semanal. Los hitos previos conservan su clasificación baseline.

Los JSON generados y el resumen de IDs quedan como artefactos locales en `artifacts/piloto-demo/`, fuera del código publicado. No se trasladaron datos de estas pruebas a producción. Para validar recurrencia hacen falta sesiones en días distintos; no se alteraron fechas para simularlas.
