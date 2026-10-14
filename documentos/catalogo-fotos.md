# Fotos privadas del catálogo

La galería permite subir JPEG/PNG/WebP, ampliar imágenes, ordenar y elegir portada en fichas de propiedades y vehículos. La primera foto según el orden es la portada; al borrarla queda la siguiente. Support solo puede leer.

Las imágenes se decodifican con sharp, se orientan según EXIF, se reducen a 1600 px y se convierten a WebP sin conservar EXIF/GPS. Se rechazan SVG, animaciones, imágenes inválidas o de más de 16 megapíxeles. Límites técnicos del piloto: 6 MB por entrada, 512 KB por imagen optimizada, 12 imágenes por ficha y 100 MB por organización. No son cuotas comerciales de los planes. Se limitan a dos decodificaciones simultáneas por proceso; una saturación devuelve 429 para reintentar.

El contenido vive en bytea dentro de PostgreSQL, junto a sus dimensiones y orden. No se guarda el nombre original. La migración 0015 usa FORCE RLS y relaciones compuestas organización/ficha. Leer bytes exige sesión, membresía y módulo habilitado, y se valida que la foto pertenezca a la ficha indicada. Las respuestas son privadas/no-store con tipo WebP fijo y nosniff. No existen enlaces públicos; futuras publicaciones en Plata Web necesitan un mecanismo explícito.

La decodificación sucede fuera de la transacción. Las modificaciones bloquean la organización y la ficha, y validan el límite agregado antes de insertar. Bytes y metadatos se guardan/eliminan en la misma transacción; el reordenamiento exige la lista completa y sin duplicados. Los cambios aceptados cuentan como actividad del piloto. Una carga múltiple realiza solicitudes individuales: las imágenes previas quedan guardadas si una posterior falla, y la interfaz indica el avance parcial.

Archivar una ficha conserva sus fotos; eliminar la ficha u organización elimina los bytes en cascada. Los backups y restauraciones de la DB incluyen las fotos. No requiere volumen Docker, cuenta externa ni nuevas credenciales. Para publicar: backup restaurable antes de migrar, aplicar 0014 si falta y luego 0015, verificar permisos plata_app y desplegar API/web juntas.

Guardar fotos en DB es una decisión acotada al piloto. A mayor escala, mover los bytes a almacenamiento de objetos privado y conservar los metadatos en DB; medir tamaño de backups, latencia y transferencia antes de ampliar los límites. La primera versión muestra galería y portada en el detalle; no agrega imágenes a las tarjetas del listado.
