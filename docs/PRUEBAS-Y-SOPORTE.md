# Pruebas, incidencias y próximos pasos

## Pruebas automatizadas

Después de instalar dependencias, ejecutar `npm test` desde la raíz. Node ejecuta `node --test` sin un servicio separado. Los tests HTTP crean servidores temporales en puertos disponibles y los cierran al terminar.

| Archivo | Cobertura |
| --- | --- |
| `test/api.test.js` | Login, cookie, carga móvil compartida con kiosco, rechazo de las rutas locales retiradas, límite exacto de 5 MiB, revisión, cancelación, caducidad, cierre de sesión y rechazo de otro origen |
| `test/store.test.js` | Vencimiento a 120 segundos, aislamiento, revocación, finalización y limpieza |
| `test/documents.test.js` | Reconocimiento de PNG/PDF, contenedores incompletos y huellas de contenido |
| `test/review.test.js` | Acceso al contenido, permisos entre usuarios, revisión, eliminación, reemplazo, duplicados y rechazo atómico de lotes |

La suite contiene ocho pruebas. Incluye la regresión que impide iniciar o enviar cargas locales por API. El reconocimiento binario probado es básico; no es un escáner antivirus ni una prueba exhaustiva de cada formato y navegador.

## Guion de aceptación manual

| Escenario | Resultado esperado |
| --- | --- |
| Contraseña errónea | Mensaje de error; sin sesión administrativa |
| Cargar desde el móvil una imagen y un PDF ficticios | Miniatura/visor, nombre y tamaño visibles |
| Abrir y confirmar solo un archivo | Continuar sigue deshabilitado mientras falte otro |
| Revisar todos | Continuar queda habilitado y finaliza correctamente |
| Eliminar un documento | Desaparece también en el otro dispositivo al actualizarse el estado |
| Repetir contenido con otro nombre | Rechazo como duplicado |
| Cargar un lote con un archivo inválido | No se agrega ninguno de ese lote |
| Panel del kiosco | Solo ofrece Generar código QR, sin carga desde el ordenador |
| Escanear QR en otro teléfono | Acceso al mismo número de trámite sin contraseña administrativa |
| Cancelar desde el móvil | Kiosco vuelve al panel y el enlace deja de funcionar |
| Dejar vencer 120 segundos | Mismo resultado que cancelar, con aviso de vencimiento |
| Recargar el kiosco durante la espera | Mismo QR y tiempo restante |
| Cerrar sesión con QR activo | Móvil pierde acceso al trámite |
| Cortar y recuperar red | Aviso y reintento de polling; el plazo del servidor no se pausa |

La cámara nativa, HEIC/HEIF y conectividad entre un teléfono físico y la Wi-Fi requieren verificación en los dispositivos destino. La revisión visual previa en navegador cubre imagen PNG y PDF ficticio; no implica haber probado cámaras físicas de todos los modelos.

## Solución de problemas

**localhost no abre después de reiniciar el ordenador:** abrir una terminal en la carpeta del proyecto y ejecutar `npm start`. Mantenerla abierta. Después de un reinicio no se restauran trámites ni documentos.

**Faltan Express u otras dependencias:** ejecutar `npm install`. Para utilizar el lockfile de pnpm, instalar pnpm y ejecutar `pnpm install --frozen-lockfile`; después puede usar `pnpm start` y `pnpm test`.

**El puerto 3000 está ocupado:** cerrar la otra instancia o definir otro `PORT`. Ejemplo PowerShell: `$env:PORT="3001"`, seguido de `npm start`. Abrir la nueva dirección y ajustar `PUBLIC_BASE_URL` al mismo puerto.

**El móvil no conecta:** confirmar la IP actual del ordenador, misma red, puerto accesible y ausencia de aislamiento de clientes en Wi-Fi de invitados. `localhost` y `127.0.0.1` en el teléfono apuntan al teléfono, no al kiosco. Usar una URL como `http://192.168.1.50:3000`; la IP de ejemplo debe reemplazarse. Si se autoriza una regla de firewall, limitarla a la red privada necesaria.

**Se abre el portal pero el enlace terminó:** volver a generar QR. No reutilizar un enlace anterior ni intentar ampliar su plazo recargando.

**Continuar está gris:** abrir cada documento y pulsar la confirmación de revisión. Si el visor no puede mostrar un archivo, sustituirlo por uno legible y compatible.

**El PDF no aparece o pide contraseña:** usar un PDF sin protección, completo y legible, o fotografías JPG/PNG. El visor local necesita que se haya instalado `pdfjs-dist`; no funciona abriendo `index.html` directamente como archivo del sistema.

**La imagen HEIC no aparece:** exportar una copia JPG/PNG. El servidor puede reconocer el contenedor sin que el navegador sea capaz de decodificarlo.

**El servidor dice que el archivo es inválido:** renombrar la extensión no convierte su contenido. Volver a exportarlo desde la aplicación de origen y comprobar que no esté vacío ni truncado.

## Mejoras propuestas, todavía no implementadas

La separación del acceso del kiosco a una URL distinta se deja para una fase posterior. El portal actual y su URL móvil se conservan en esta entrega.

1. Requisitos configurables por trámite: cédula frente/reverso, certificado de sangre y otros.
2. Ayudas de encuadre, orientación, recorte y control de legibilidad de fotos.
3. Revisión por operador con observaciones y solicitudes de reemplazo.
4. Comprobante y seguimiento de una entrega mediante un identificador de trámite.
5. Persistencia protegida, autenticación productiva y límites globales de recursos.

La publicación del código en GitHub no publica automáticamente el servidor ni crea una URL pública del demo. Jesús debe descargar el proyecto e iniciarlo, o preparar un alojamiento de Node.js por separado.
