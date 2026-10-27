const app = document.querySelector('#app');
const logout = document.querySelector('#logout');
const picker = document.querySelector('#picker');
const camera = document.querySelector('#camera');
const dialog = document.querySelector('#photo-dialog');
const documentDialog = document.querySelector('#document-dialog');
let viewingFileId = null;
let pdfTask = null;
const mobileToken = location.pathname.match(/^\/mobile\/([a-f0-9]{64})$/)?.[1];
let state = null, qr = null, busy = false, ended = false, pendingPhoto = null, previewUrl = null, offset = 0;
const mobileBase = `/api/mobile/${mobileToken}`;
const icons = {
  mobile: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><rect x="13" y="4" width="23" height="40" rx="4"/><path d="M21 9h7M22 38h5M4 20h17m-6-6 6 6-6 6"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v6h5M8 13h8M8 17h6"/></svg>'
};
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
async function api(url, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(url, { method, headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'No se pudo conectar.'); error.status = response.status; throw error; }
  return data;
}
function notice(message) { const element = document.querySelector('#notice'); element.textContent = message; element.classList.remove('hidden'); clearTimeout(notice.timer); notice.timer = setTimeout(() => element.classList.add('hidden'), 7000); }
function steps(active = 1) { return `<nav class="steps" aria-label="Progreso"><span class="${active === 1 ? 'active' : 'done'}"><b>01</b> Conecta tu móvil</span><i></i><span class="${active === 2 ? 'active' : active > 2 ? 'done' : ''}"><b>02</b> Carga y revisa</span><i></i><span class="${active === 3 ? 'active' : ''}"><b>03</b> ¡Todo listo!</span></nav>`; }
function heading(eyebrow, title, subtitle) { return `<div class="heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>`; }
function sessionBar() { return `<div class="session-bar"><span><i class="status-dot"></i> Sesión activa <b>·</b> Administrador</span><span>Trámite <strong>#${state.id.slice(0, 8).toUpperCase()}</strong></span></div>`; }
function fileUrl(file) { return `${mobileToken ? mobileBase : '/api'}/files/${file.id}/content`; }
function formatSize(bytes) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`; }
function canContinue() { return state.files.length > 0 && state.files.every(file => file.reviewed); }
function fileList() {
  const reviewed = state.files.filter(file => file.reviewed).length;
  return `<div class="files">${state.files.map(file => `<article class="file-row document-row"><button class="file-thumbnail" data-preview="${file.id}" aria-label="Ver ${escapeHTML(file.name)}">${['image/jpeg','image/png','image/webp'].includes(file.type) ? `<img src="${fileUrl(file)}" alt="Miniatura de ${escapeHTML(file.name)}" loading="lazy">` : icons.file}</button><div class="file-details"><strong>${escapeHTML(file.name)}</strong><small>${file.type === 'application/pdf' ? 'PDF' : file.type.replace('image/','').toUpperCase()} · ${formatSize(file.size)} <span class="technical-check">✓ Formato reconocido</span></small><span class="review-state ${file.reviewed ? 'reviewed' : ''}">${file.reviewed ? '✓ Revisado por ti' : '◷ Pendiente de tu revisión'}</span></div><div class="file-controls"><button class="file-view" data-preview="${file.id}">Ver documento</button><button class="file-remove" data-remove="${file.id}" aria-label="Eliminar ${escapeHTML(file.name)}">Eliminar</button></div></article>`).join('')}</div>${state.files.length ? `<div class="review-summary ${canContinue() ? 'all-reviewed' : ''}"><span>${canContinue() ? '✓ Todo listo para continuar' : 'Revisa los documentos antes de continuar'}</span><strong>${reviewed} de ${state.files.length} revisados</strong></div><p class="review-note">Abre cada archivo y confirma que corresponde al trámite y se lee con claridad.</p>` : ''}`;
}
function syncState(data) {
  state = data; offset = data.serverTime - Date.now();
  if (documentDialog.open && (!state.files.some(file => file.id === viewingFileId) || state.status === 'complete')) closeDocument();
}
function closeDocument() { documentDialog.close(); viewingFileId = null; if (pdfTask) { pdfTask.destroy(); pdfTask = null; } document.querySelector('#document-content').replaceChildren(); }
function openDocument(id) {
  const file = state.files.find(file => file.id === id);
  if (!file) return;
  viewingFileId = id;
  document.querySelector('#document-title').textContent = file.name;
  const url = fileUrl(file);
  const container = document.querySelector('#document-content');
  container.innerHTML = `${file.type === 'application/pdf' ? '<div class="pdf-loading" role="status">Preparando vista previa…</div><canvas class="pdf-canvas" aria-label="Página del documento PDF"></canvas><div class="pdf-controls"><button id="pdf-previous" class="button secondary" disabled>← Anterior</button><span id="pdf-page" aria-live="polite"></span><button id="pdf-next" class="button secondary" disabled>Siguiente →</button></div>' : `<img src="${url}" alt="Vista previa de ${escapeHTML(file.name)}">`}<p class="preview-fallback">¿No se muestra correctamente? <a href="${url}" target="_blank" rel="noopener noreferrer">Abrir archivo original ↗</a></p>`;
  const image = container.querySelector('img');
  if (image) {
    image.onload = () => { if (viewingFileId === id) document.querySelector('#review-document').disabled = false; };
    image.onerror = () => { image.hidden = true; container.querySelector('.preview-fallback').prepend('No se pudo mostrar esta imagen. Carga una versión JPG, PNG o WebP que se pueda revisar. '); document.querySelector('#review-document').disabled = true; };
  }
  document.querySelector('#review-document').textContent = file.reviewed ? 'Confirmar revisión ✓' : 'Se ve bien, confirmar ✓';
  document.querySelector('#review-document').disabled = !image || !image.complete || !image.naturalWidth;
  documentDialog.showModal();
  if (file.type === 'application/pdf') renderPdf(url, id);
}
async function renderPdf(url, id) {
  const container = document.querySelector('#document-content');
  try {
    const pdfjs = await import('/vendor/pdfjs/build/pdf.mjs');
    if (viewingFileId !== id) return;
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.mjs';
    const task = pdfjs.getDocument({ url, isEvalSupported: false, enableXfa: false, stopAtErrors: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', wasmUrl: '/vendor/pdfjs/wasm/' });
    pdfTask = task;
    const pdf = await task.promise;
    let currentPage = 1, rendering = false;
    const previous = container.querySelector('#pdf-previous'), next = container.querySelector('#pdf-next');
    async function showPage(pageNumber) {
      if (rendering || viewingFileId !== id) return;
      rendering = true; previous.disabled = true; next.disabled = true;
      try {
        const page = await pdf.getPage(pageNumber);
        if (viewingFileId !== id) return;
        const canvas = container.querySelector('canvas');
        const base = page.getViewport({ scale: 1 });
        const width = Math.min(container.clientWidth - 26, 1100);
        const viewport = page.getViewport({ scale: width / base.width * Math.min(window.devicePixelRatio || 1, 2) });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (viewingFileId !== id) return;
        currentPage = pageNumber;
        container.querySelector('.pdf-loading').hidden = true;
        container.querySelector('#pdf-page').textContent = `Página ${currentPage} de ${pdf.numPages}`;
        document.querySelector('#review-document').disabled = false;
      } finally {
        rendering = false;
        previous.disabled = currentPage <= 1; next.disabled = currentPage >= pdf.numPages;
      }
    }
    previous.onclick = () => showPage(currentPage - 1).catch(failed);
    next.onclick = () => showPage(currentPage + 1).catch(failed);
    await showPage(1);
  } catch (error) { failed(error); }
  function failed(error) {
    if (viewingFileId !== id) return;
    container.querySelector('.pdf-loading').hidden = false;
    container.querySelector('.pdf-loading').textContent = 'No pudimos leer este PDF. Comprueba que no esté dañado ni protegido con contraseña, o carga una imagen.';
    document.querySelector('#review-document').disabled = true;
  }
}
async function removeDocument(id) {
  syncState(await api(`${mobileToken ? mobileBase : '/api'}/files/${id}`, {}, 'DELETE'));
  render(); notice('Documento eliminado. Puedes cargar otro archivo.');
}
app.addEventListener('click', event => {
  const preview = event.target.closest('[data-preview]');
  const remove = event.target.closest('[data-remove]');
  if (preview && !busy && !ended) openDocument(preview.dataset.preview);
  if (remove) action(() => removeDocument(remove.dataset.remove));
});
document.querySelector('#close-document').onclick = closeDocument;
documentDialog.addEventListener('cancel', closeDocument);
document.querySelector('#remove-document').onclick = () => action(() => removeDocument(viewingFileId));
document.querySelector('#review-document').onclick = () => action(async () => {
  syncState(await api(`${mobileToken ? mobileBase : '/api'}/files/${viewingFileId}/review`, {}));
  closeDocument(); render(); notice(canContinue() ? 'Todos los documentos están revisados. Ya puedes continuar.' : 'Documento revisado. Comprueba los restantes.');
});
function renderLogin() {
  if (documentDialog.open) closeDocument();
  logout.classList.add('hidden');
  app.innerHTML = `<div class="login-layout"><section class="login-intro"><span class="eyebrow">AUTOGESTIÓN DE DOCUMENTOS</span><h1>Un paso más cerca<br>de tu licencia.</h1><p>Carga los documentos de tu trámite desde tu teléfono y envíalos al kiosco con un código QR.</p><div class="intro-art">${icons.file}<span class="art-check">✓</span><div class="art-phone">${icons.mobile}</div></div><span class="intro-bottom">01 / UN TRÁMITE SIN COMPLICACIONES</span></section><section class="login-card"><span class="eyebrow">BIENVENIDO A SERTRACEN</span><h2>Inicia tu sesión</h2><p>Ingresa tus credenciales para comenzar.</p><form id="login-form"><label for="username">Usuario</label><input id="username" name="username" autocomplete="username" placeholder="Ingresa tu usuario" required><label for="password">Contraseña</label><input id="password" name="password" type="password" autocomplete="current-password" placeholder="Ingresa tu contraseña" required><p id="login-error" class="error" role="alert"></p><button class="button primary full">Iniciar sesión <span>→</span></button></form><div class="demo-info"><b>Acceso de demostración</b><span>Usuario: <strong>admin</strong> &nbsp; Contraseña: <strong>admin</strong></span></div></section></div>`;
  document.querySelector('#login-form').onsubmit = event => {
    event.preventDefault();
    action(async () => {
    const values = new FormData(event.target);
    try { await api('/api/login', Object.fromEntries(values)); syncState(await api('/api/session')); render(); }
    catch (error) { document.querySelector('#login-error').textContent = error.message; }
    });
  };
}
function render() {
  logout.classList.toggle('hidden', !!mobileToken);
  if (mobileToken) return renderMobile();
  if (state.status === 'complete') return renderSuccess();
  if (state.status === 'waiting') return renderWaiting();
  app.innerHTML = `${sessionBar()}${steps()}${heading('DOCUMENTOS PARA TU LICENCIA', 'Carga tus documentos desde el móvil', 'Conecta tu teléfono con un código QR para agregar los requisitos de tu trámite.')}<div class="mobile-start"><button class="option-card mobile-card" id="mobile"><span class="option-number">CARGA DE DOCUMENTOS <em>CON TU TELÉFONO</em></span><span class="option-icon">${icons.mobile}</span><h2>Conecta tu teléfono</h2><p>Escanea el código QR y toma fotos o selecciona los documentos que tienes en tu móvil.</p><span class="option-link">Generar código QR <b>→</b></span></button></div><div class="help-strip"><span class="help-icon">i</span><div><strong>Ten tus documentos a mano</strong><p>Cédula, certificado de tipo de sangre y demás requisitos de tu trámite.</p></div><span class="format-badge">PDF o imágenes · Máx. 5 MB por archivo</span></div>`;
  document.querySelector('#mobile').onclick = () => action(async () => { const data = await api('/api/start/mobile', {}); qr = data; syncState(data); render(); });
}
function renderWaiting() {
  app.innerHTML = `${sessionBar()}${steps(2)}${heading('CARGA DESDE EL MÓVIL', 'En espera de sus Documentos', 'Escanea el código QR con la cámara de tu teléfono para comenzar.')}<section class="panel qr-layout"><div class="qr-box">${qr ? `<img src="${qr.qr}" alt="QR para abrir el portal móvil de carga" width="250" height="250">` : '<p>Preparando QR…</p>'}<span class="qr-label">ESCANEA PARA CONECTARTE</span></div><div class="qr-instructions"><span class="timer" id="timer" role="timer">02:00</span><h2>Tu teléfono, tu escáner.</h2><ol><li>Abre la cámara y apunta al código QR.</li><li>Fotografía o selecciona tus documentos.</li><li>Pulsa <strong>Continuar</strong> en tu móvil.</li></ol><p class="muted">Ambos dispositivos deben tener acceso a esta dirección. El enlace vence en 2 minutos.</p><button id="cancel" class="button secondary">Cancelar carga</button></div><div class="qr-file-list"><div class="list-title">Documentos recibidos <b>${state.files.length}</b></div>${fileList()}</div></section>`;
  document.querySelector('#cancel').onclick = () => action(async () => { syncState(await api('/api/cancel', {})); qr = null; render(); }); updateTimer();
}
function renderMobile() {
  app.innerHTML = `<div class="mobile-content">${heading('SERTRACEN PANAMÁ · PORTAL MÓVIL', 'Tus documentos,<br>en un solo lugar.', 'Toma una fotografía o selecciona los archivos para enviarlos al kiosco.')}<div class="mobile-status"><i class="status-dot"></i> Conectado al trámite #${state.id.slice(0, 8).toUpperCase()} <span class="timer" id="timer"></span></div><div class="mobile-options"><button id="take-photo" class="button primary">◉ &nbsp; Desde cámara</button><button id="add-files" class="button secondary">↑ &nbsp; Cargar documentos</button></div><p class="muted">PDF o imágenes · Máximo 5 MB por archivo · Hasta 20 documentos</p><section class="panel"><div class="list-title">Tus documentos <b>${state.files.length}</b></div>${fileList()}${!state.files.length ? '<p class="empty">Los documentos que agregues aparecerán aquí.</p>' : ''}<div class="actions"><button id="cancel" class="button secondary">Cancelar</button><button id="continue" class="button primary" ${!canContinue() ? 'disabled' : ''}>Continuar →</button></div></section><p class="privacy-note">La carga se sincroniza automáticamente con el kiosco.</p></div>`;
  document.querySelector('#take-photo').onclick = () => camera.click(); document.querySelector('#add-files').onclick = () => picker.click(); bindActions(); updateTimer();
}
function renderSuccess() {
  app.innerHTML = `${mobileToken ? '' : sessionBar() + steps(3)}<section class="success"><span class="success-check">✓</span><span class="eyebrow">PROCESO FINALIZADO</span><h1>¡Carga Exitosa!</h1><p>${mobileToken ? 'Tus documentos fueron enviados. Puedes volver al kiosco y cerrar esta página.' : 'Tus documentos se han recibido correctamente.'}</p>${state ? `<div class="success-summary"><strong>${state.files.length} documento${state.files.length === 1 ? '' : 's'} recibido${state.files.length === 1 ? '' : 's'}</strong><span>Trámite #${state.id.slice(0, 8).toUpperCase()}</span></div>` : ''}${mobileToken ? '' : '<button id="new" class="button primary">Iniciar nuevo trámite →</button>'}</section>`;
  if (!mobileToken) document.querySelector('#new').onclick = () => action(async () => { syncState(await api('/api/new', {})); qr = null; render(); });
}
function mobileEnded(message) { ended = true; cleanupPhoto(); if (documentDialog.open) closeDocument(); app.innerHTML = `<section class="success"><span class="success-check neutral">i</span><h1>Enlace finalizado</h1><p>${escapeHTML(message)}</p><p class="muted">Regresa al kiosco para iniciar otra carga.</p></section>`; }
function bindActions() {
  document.querySelector('#cancel').onclick = () => action(async () => { await api(`${mobileBase}/cancel`, {}); mobileEnded('Has cancelado la carga.'); });
  document.querySelector('#continue').onclick = () => action(async () => { await api(`${mobileBase}/complete`, {}); ended = true; cleanupPhoto(); renderSuccess(); });
}
async function action(task) {
  if (busy || ended) return;
  busy = true; app.setAttribute('aria-busy', 'true'); document.body.classList.add('working');
  try { await task(); } catch (error) { if (error.status === 401 && !mobileToken) { state = null; renderLogin(); } else if (error.status === 410 && mobileToken) mobileEnded(error.message); else notice(error.message); }
  finally { busy = false; app.removeAttribute('aria-busy'); document.body.classList.remove('working'); }
}
async function uploadFiles(files) {
  if (!files.length) return;
  if (!mobileToken) throw new Error('Abre el enlace QR en tu teléfono para cargar documentos.');
  if (files.some(file => file.size > 5 * 1024 * 1024 || file.size === 0)) throw new Error('Cada archivo debe contener datos y pesar como máximo 5 MB.');
  if (files.length + state.files.length > 20) throw new Error('Puede agregar hasta 20 documentos.');
  notice('Validando y cargando documentos…');
  const body = new FormData(); files.forEach(file => body.append('files', file));
  syncState(await api(`${mobileBase}/files`, body)); render(); notice('Carga recibida. Abre los documentos para revisarlos.');
}
picker.onchange = () => { const files = [...picker.files]; picker.value = ''; action(() => uploadFiles(files)); };
camera.onchange = () => {
  pendingPhoto = camera.files[0]; camera.value = '';
  if (!pendingPhoto) return;
  if (pendingPhoto.size > 5 * 1024 * 1024) { pendingPhoto = null; return notice('La fotografía supera los 5 MB. Toma otra con menor resolución.'); }
  previewUrl = URL.createObjectURL(pendingPhoto); document.querySelector('#photo-preview').src = previewUrl;
  document.querySelector('#photo-name').textContent = pendingPhoto.name; dialog.showModal();
};
function cleanupPhoto() { if (dialog.open) dialog.close(); if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = null; pendingPhoto = null; }
document.querySelector('#reject-photo').onclick = () => { cleanupPhoto(); if (!ended) camera.click(); };
dialog.addEventListener('cancel', cleanupPhoto);
document.querySelector('#accept-photo').onclick = () => action(async () => { const file = pendingPhoto; cleanupPhoto(); if (file) await uploadFiles([file]); });
logout.onclick = () => action(async () => { await api('/api/logout', {}); state = null; qr = null; renderLogin(); });
function updateTimer() {
  const timer = document.querySelector('#timer'); if (!timer || !state?.expiresAt) return;
  const seconds = Math.max(0, Math.ceil((state.expiresAt - Date.now() - offset) / 1000));
  timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  timer.classList.toggle('urgent', seconds <= 30);
}
setInterval(updateTimer, 250);
// Single-flight polling keeps state consistent without overlapping requests.
async function poll() {
  try {
    if (!ended && !busy && (mobileToken || state)) {
      const data = await api(mobileToken ? mobileBase : '/api/session');
      if (!busy && !ended) {
        const changed = !state || state.status !== data.status || JSON.stringify(state.files) !== JSON.stringify(data.files);
        syncState(data);
        if (changed) { if (data.reason === 'expired') notice('Se agotó el tiempo para cargar desde el móvil.'); render(); }
      }
    }
  } catch (error) {
    if (error.status === 410 && mobileToken && !ended) mobileEnded(error.message);
    else if (error.status === 401 && !mobileToken) { state = null; renderLogin(); }
    else if (!ended && !busy) notice('Conexión interrumpida. Reintentando automáticamente…');
  } finally { setTimeout(poll, 800); }
}
(async () => {
  try { syncState(await api(mobileToken ? mobileBase : '/api/session')); if (state.status === 'waiting' && !mobileToken) qr = await api('/api/qr'); render(); }
  catch (error) { if (mobileToken) mobileEnded(error.message); else renderLogin(); }
  poll();
})();
