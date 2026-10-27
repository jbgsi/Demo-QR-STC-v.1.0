import { randomBytes, randomUUID } from 'node:crypto';

export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_FILES = 20;
export const TTL = 120_000;

/** Estado efímero del demo: documentos binarios y enlaces nunca se escriben en disco. */
export class Store {
  constructor(now = Date.now) {
    this.now = now;
    this.jobs = new Map();
    this.links = new Map();
  }
  create(owner) {
    const job = { id: randomUUID(), owner, status: 'idle', source: null, files: [], expiresAt: null, token: null, reason: null };
    this.jobs.set(owner, job);
    return job;
  }
  get(owner) {
    const job = this.jobs.get(owner);
    if (job?.status === 'waiting' && this.now() >= job.expiresAt) this.cancel(job, 'expired');
    return job;
  }
  begin(job, source) {
    if (job.status === 'complete') throw new Error('El proceso ya finalizó. Inicie un nuevo trámite.');
    this.cancel(job);
    job.attempt = randomUUID();
    job.source = source;
    job.status = source === 'mobile' ? 'waiting' : 'uploading';
    job.reason = null;
    if (source === 'mobile') {
      job.token = randomBytes(32).toString('hex');
      job.expiresAt = this.now() + TTL;
      this.links.set(job.token, job.owner);
    }
    return job;
  }
  resolve(token) {
    const owner = this.links.get(token);
    const job = owner && this.get(owner);
    return job?.token === token && job.status === 'waiting' ? job : null;
  }
  cancel(job, reason = null) {
    if (job.token) this.links.delete(job.token);
    Object.assign(job, { token: null, expiresAt: null, files: [], status: 'idle', source: null, reason });
  }
  finish(job) {
    if (!job.files.length) throw new Error('Agregue al menos un documento para continuar.');
    if (job.files.some(file => !file.reviewed)) throw new Error('La carga requiere revisar y confirmar cada documento antes de continuar.');
    if (job.status !== 'waiting' && job.status !== 'uploading') throw new Error('La carga ya no está activa.');
    if (job.token) this.links.delete(job.token);
    Object.assign(job, { status: 'complete', token: null, expiresAt: null });
  }
  destroy(owner) {
    const job = this.jobs.get(owner);
    if (job) this.cancel(job);
    this.jobs.delete(owner);
  }
  snapshot(job) {
    return { id: job.id, status: job.status, source: job.source, reason: job.reason, expiresAt: job.expiresAt,
      serverTime: this.now(), files: job.files.map(({ id, name, size, type, reviewed }) => ({ id, name, size, type, reviewed: !!reviewed })) };
  }
}
