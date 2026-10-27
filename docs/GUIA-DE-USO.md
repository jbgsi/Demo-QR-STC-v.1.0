# Guía de uso

## Preparar la demostración

Se mantienen las direcciones actuales: `/` para el acceso/control del kiosco y `/mobile/:token` para el portal móvil. La separación del kiosco a otra URL queda pendiente para una etapa posterior.

1. Instalar las dependencias y arrancar siguiendo el [README](../README.md).
2. Abrir la dirección del servidor e iniciar sesión con `admin` / `admin`.
3. Usar archivos ficticios. En `test/fixtures/documento-demo.pdf` hay un PDF de muestra sin datos personales.

## Desde el kiosco

1. Iniciar sesión y pulsar **Generar código QR** en la tarjeta **Conecta tu teléfono**.
2. Mantener abierta la pantalla de espera mientras se cargan y revisan los documentos desde el móvil.
3. Consultar los archivos recibidos con **Ver documento**; el kiosco también permite revisar y eliminar archivos del intento activo.
4. La finalización se realiza con **Continuar** en el teléfono. El kiosco muestra **Carga Exitosa** automáticamente.

El kiosco no tiene selector de archivos ni opción de carga desde el ordenador. **Cancelar carga** descarta el intento y regresa al panel con la sesión abierta. **Iniciar nuevo trámite** borra el resumen anterior y prepara otro trámite.

## Desde el móvil

1. Conectar ordenador y teléfono a la misma red que permita comunicación entre dispositivos.
2. En el kiosco, pulsar **Generar código QR**.
3. Escanear el QR: el teléfono abre un portal asociado al trámite, sin pedir la contraseña administrativa.
4. Usar **Desde cámara** o **Cargar documentos**. La captura nativa puede ofrecer cámara o galería según el navegador.
5. Tras una foto, aceptar para enviarla o cancelar para repetirla.
6. Abrir cada archivo en la lista y confirmar su revisión. Las listas y estados se actualizan también en el kiosco.
7. Pulsar **Continuar** en el teléfono antes de que termine el plazo. El kiosco mostrará el resultado.

El plazo es de **120 segundos desde la generación del QR**, incluye carga y revisión y no se amplía al escanear ni al recargar. Al cancelar en cualquiera de los dispositivos o vencer el plazo, el intento se descarta y el kiosco vuelve al panel. Para reintentar se genera otro QR.

## Reglas de carga

- Hasta 20 documentos, con un máximo de 5 MiB (5 × 1024 × 1024 bytes) por archivo.
- PDF, JPEG, PNG, WebP y contenedores HEIC/HEIF reconocidos por el servidor.
- Un archivo vacío, un formato no reconocido o un duplicado hace que se rechace el lote seleccionado completo. Los documentos anteriores permanecen.
- La detección de duplicados usa el contenido, aunque el archivo tenga otro nombre.
- Una imagen que el navegador no pueda mostrar debe reemplazarse por una versión compatible, preferiblemente JPG o PNG.
- Los PDF dañados o protegidos que el visor no pueda abrir no permiten confirmar la revisión.

**Formato reconocido** significa que pasó una comprobación técnica básica. **Revisado por ti** significa que el usuario confirmó la revisión visual. No son validaciones de autenticidad ni aprobación del trámite.

## Cerrar sesión

El botón del kiosco destruye la sesión administrativa, elimina sus documentos y revoca el enlace del móvil. Cerrar solamente la pestaña no equivale a pulsar ese botón. Reiniciar el servidor borra todas las sesiones y documentos del demo.
