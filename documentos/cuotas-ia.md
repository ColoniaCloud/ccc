# Cuotas mensuales de IA

Free: 10; Pro: 40; Business: 100; Master: 250; Enterprise: 500 consultas por organización y mes calendario, compartidas entre sus miembros. Renovación a las 00:00 de America/Montevideo del primer día del mes. No cambia precios ni fechas de cobro.

Una consulta es una petición reservada para el proveedor Anthropic. Se consume antes de llamar, incluidos fallos, tiempos de espera y respuestas descartadas por cambios posteriores. Los rechazos de permisos, validación, revisión o conversación ocupada no consumen. No se devuelve una reserva abandonada, porque el proveedor puede haberla procesado.

La reserva usa la misma transacción que la preparación y un bloqueo de la organización. La finalización es idempotente y acumula tokens conocidos en el mes original. Los tokens de peticiones fallidas pueden ser desconocidos: no equivalen a una factura ni a un costo monetario. La configuración manual y la aprobación siguen disponibles sin cuota. Cambiar el plan conserva el consumo del mes; bajar de plan puede dejar el consumo por encima del límite.

La migración 0016 crea ai_monthly_usage y ai_requests, ambas con RLS forzada. La nueva contabilidad comienza al desplegarse: no reconstruye consultas históricas. Se conservan intentos y tokens históricos del onboarding, sin el antiguo límite vitalicio de 20 intentos. El contexto enviado al modelo comprende los últimos 20 mensajes; la conversación completa sigue almacenada.

Configuración opcional: AI_MONTHLY_LIMIT_FREE, AI_MONTHLY_LIMIT_PRO, AI_MONTHLY_LIMIT_BUSINESS, AI_MONTHLY_LIMIT_MASTER y AI_MONTHLY_LIMIT_ENTERPRISE. Enteros entre 0 y 100000; cero deshabilita consultas en ese plan. Valores inválidos producen error, sin abrir acceso ilimitado. Configurar estas variables en el entorno del contenedor API si se desean sobrescribir los valores aprobados.

GET /api/ai/usage devuelve el resumen mensual a propietario y administradores. El onboarding incluye el resumen agregado para sus miembros autenticados; las consultas al proveedor siguen reservadas a propietario y administradores. No se exponen textos ni el historial interno de reservas en ese endpoint. La cuota aplica al asistente de onboarding; no habilita herramientas futuras.

Antes de publicar: respaldar y comprobar restauración, ejecutar la migración mediante el despliegue existente y verificar RLS, privilegios, salud y lectura con el rol de aplicación. No modificar el consumo de organizaciones reales como prueba.
