import express from 'express';
import session from 'express-session';
import multer from 'multer';
import QRCode from 'qrcode';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Store, MAX_BYTES, MAX_FILES } from './store.js';
import { inspectDocument, documentHash } from './documents.js';

export function createApp({ store = new Store(), secret = process.env.SESSION_SECRET || randomBytes(48).toString('hex'), publicBaseUrl = process.env.PUBLIC_BASE_URL } = {}) {
  const app = express();
  if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    // Reject browser mutations from other origins, including multipart form submissions.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin')) {
      let origin;
      try { origin = new URL(req.get('origin')).host; } catch { return res.status(403).json({ error: 'Origen no permitido.' }); }
      if (origin !== req.get('host')) return res.status(403).json({ error: 'Origen no permitido.' });
    }
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  const reqSessionStore = new session.MemoryStore();
  app.use(session({ store: reqSessionStore, secret, resave: false, saveUninitialized: false, name: 'stc.sid',
    cookie: { httpOnly: true, sameSite: 'strict', secure: 'auto', maxAge: 30 * 60_000 } }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: MAX_FILES, fields: 0 } }).array('files', MAX_FILES);
  const authenticate = (req, res, next) => {
    if (!req.session.authenticated) return res.status(401).json({ error: 'Inicie sesión para continuar.' });
    const job = store.get(req.sessionID);
    if (!job) return res.status(401).json({ error: 'La sesión ha vencido.' });
    req.job = job;
    req.attempt = job.attempt;
    next();
  };
  const mobile = (req, res, next) => {
    const job = store.resolve(req.params.token);
    if (!job) return res.status(410).json({ error: 'El enlace venció o la carga finalizó. Genere otro QR en el kiosco.' });
    req.job = job;
    next();
  };
  app.post('/api/login', (req, res, next) => {
    if (req.body?.username !== 'admin' || req.body?.password !== 'admin') return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    const previous = req.sessionID;
    req.session.regenerate(error => {
      if (error) return next(error);
      store.destroy(previous);
      req.session.authenticated = true;
      store.create(req.sessionID);
      req.session.save(error => error ? next(error) : res.json({ ok: true }));
    });
  });
  app.post('/api/logout', (req, res, next) => {
    store.destroy(req.sessionID);
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('stc.sid').json({ ok: true });
    });
  });
  app.get('/api/session', authenticate, (req, res) => res.json(store.snapshot(req.job)));
  app.post('/api/start/:source', authenticate, async (req, res) => {
    if (!['local', 'mobile'].includes(req.params.source)) return res.status(400).json({ error: 'Origen inválido.' });
    if (req.job.status === 'complete') return res.status(409).json({ error: 'El proceso ya finalizó.' });
    let base;
    if (req.params.source === 'mobile') {
      // Configure an explicit LAN/public URL; never put localhost in a phone QR.
      base = publicBaseUrl || `${req.protocol}://${req.get('host')}`;
      const url = new URL(base);
      if (!['http:', 'https:'].includes(url.protocol)) return res.status(400).json({ error: 'PUBLIC_BASE_URL debe usar HTTP o HTTPS.' });
      if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return res.status(400).json({ error: 'Abra el kiosco con la IP de red del ordenador o configure PUBLIC_BASE_URL para que el móvil pueda conectarse.' });
    }
    store.begin(req.job, req.params.source);
    if (base) {
      const url = `${base.replace(/\/$/, '')}/mobile/${req.job.token}`;
      const qr = await QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'M' });
      return res.json({ ...store.snapshot(req.job), url, qr });
    }
    res.json(store.snapshot(req.job));
  });
  // Regenerate the same QR on reload without extending its expiration.
  app.get('/api/qr', authenticate, async (req, res) => {
    if (req.job.status !== 'waiting') return res.status(409).json({ error: 'No hay un enlace activo.' });
    const base = publicBaseUrl || `${req.protocol}://${req.get('host')}`;
    const url = `${base.replace(/\/$/, '')}/mobile/${req.job.token}`;
    res.json({ url, qr: await QRCode.toDataURL(url, { width: 300, margin: 2 }) });
  });
  const addFiles = (req, res) => {
    // Re-check after multipart parsing: a deadline/logout/cancel can occur during upload.
    const job = req.params.token ? store.resolve(req.params.token) : store.get(req.sessionID);
    if (!job || job !== req.job || (!req.params.token && req.attempt !== job.attempt) || !['waiting', 'uploading'].includes(job.status) || (req.params.token ? job.source !== 'mobile' : job.source !== 'local')) {
      return res.status(409).json({ error: 'Esta carga ya no está activa.' });
    }
    if (!req.files?.length) return res.status(400).json({ error: 'Seleccione al menos un archivo.' });
    if (job.files.length + req.files.length > MAX_FILES) return res.status(400).json({ error: `Máximo ${MAX_FILES} documentos por trámite.` });
    const documents = [];
    const hashes = new Set(job.files.map(file => file.hash));
    for (const file of req.files) {
      const type = inspectDocument(file.buffer);
      if (!type) return res.status(400).json({ error: `No se reconoce el contenido de «${file.originalname}». Use un PDF o una imagen JPG, PNG, WebP o HEIC completa.` });
      const hash = documentHash(file.buffer);
      if (hashes.has(hash)) return res.status(409).json({ error: `«${file.originalname}» ya está cargado. No es necesario enviarlo otra vez.` });
      hashes.add(hash);
      documents.push({ id: randomUUID(), name: file.originalname, size: file.size, type, hash, reviewed: false, buffer: file.buffer });
    }
    job.files.push(...documents);
    res.json(store.snapshot(job));
  };
  const content = (req, res) => {
    const file = req.job.files.find(file => file.id === req.params.fileId);
    if (!file) return res.status(404).json({ error: 'El documento ya no está disponible.' });
    res.set({ 'Content-Type': file.type, 'Content-Disposition': `inline; filename="documento"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16)}`)}`,
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'" });
    res.send(file.buffer);
  };
  const modifyFile = (req, res) => {
    if (!['uploading', 'waiting'].includes(req.job.status)) return res.status(409).json({ error: 'La carga ya finalizó.' });
    const index = req.job.files.findIndex(file => file.id === req.params.fileId);
    if (index < 0) return res.status(404).json({ error: 'El documento ya no está disponible.' });
    if (req.method === 'DELETE') req.job.files.splice(index, 1);
    else req.job.files[index].reviewed = true;
    res.json(store.snapshot(req.job));
  };
  app.post('/api/files', authenticate, upload, addFiles);
  app.get('/api/files/:fileId/content', authenticate, content);
  app.delete('/api/files/:fileId', authenticate, modifyFile);
  app.post('/api/files/:fileId/review', authenticate, modifyFile);
  app.post('/api/cancel', authenticate, (req, res) => { store.cancel(req.job, 'cancelled'); res.json(store.snapshot(req.job)); });
  app.post('/api/complete', authenticate, (req, res) => {
    if (req.job.source !== 'local') return res.status(409).json({ error: 'Finalice desde el móvil.' });
    store.finish(req.job); res.json(store.snapshot(req.job));
  });
  app.post('/api/new', authenticate, (req, res) => { store.destroy(req.sessionID); res.json(store.snapshot(store.create(req.sessionID))); });
  app.get('/api/mobile/:token', mobile, (req, res) => res.json(store.snapshot(req.job)));
  app.post('/api/mobile/:token/files', mobile, upload, addFiles);
  app.get('/api/mobile/:token/files/:fileId/content', mobile, content);
  app.delete('/api/mobile/:token/files/:fileId', mobile, modifyFile);
  app.post('/api/mobile/:token/files/:fileId/review', mobile, modifyFile);
  app.post('/api/mobile/:token/cancel', mobile, (req, res) => { store.cancel(req.job, 'cancelled'); res.json({ ok: true }); });
  app.post('/api/mobile/:token/complete', mobile, (req, res) => { store.finish(req.job); res.json({ ok: true }); });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  const publicPath = fileURLToPath(new URL('../public/', import.meta.url));
  app.use('/vendor/pdfjs', express.static(fileURLToPath(new URL('../node_modules/pdfjs-dist/', import.meta.url))));
  app.use(express.static(publicPath));
  app.get('/mobile/:token', (req, res) => res.sendFile(`${publicPath}/index.html`));
  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Cada archivo debe pesar como máximo 5 MB.' : 'Límite de carga excedido. Máximo 20 archivos.' });
    if (error.message?.startsWith('Agregue') || error.message?.startsWith('La carga')) return res.status(409).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'No se pudo procesar la solicitud.' });
  });
  // Release expired documents and abandoned sessions; no sensitive uploads survive restart.
  const cleanup = setInterval(() => {
    for (const owner of store.jobs.keys()) {
      store.get(owner);
      reqSessionStore.get(owner, (error, value) => { if (!error && !value) store.destroy(owner); });
    }
  }, 10_000);
  cleanup.unref();
  app.locals.dispose = () => clearInterval(cleanup);
  return app;
}
