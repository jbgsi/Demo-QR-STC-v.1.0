import test from 'node:test';
import assert from 'node:assert/strict';
import { Store, TTL } from '../src/store.js';

test('QR expires at exactly 120 seconds and removes documents', () => {
  let time = 1000;
  const store = new Store(() => time);
  const job = store.create('owner');
  store.begin(job, 'mobile');
  const token = job.token;
  job.files.push({ name: 'cedula.jpg' });
  time += TTL - 1;
  assert.equal(store.resolve(token), job);
  time++;
  assert.equal(store.resolve(token), null);
  assert.equal(job.status, 'idle');
  assert.equal(job.reason, 'expired');
  assert.deepEqual(job.files, []);
});
test('sessions are isolated and restarting invalidates the previous QR', () => {
  const store = new Store();
  const a = store.create('a'), b = store.create('b');
  store.begin(a, 'mobile');
  const old = a.token;
  store.begin(a, 'mobile');
  assert.equal(store.resolve(old), null);
  assert.equal(store.resolve(a.token), a);
  assert.deepEqual(b.files, []);
});
test('completion requires documents, invalidates mobile access and keeps a single job', () => {
  const store = new Store();
  const job = store.create('a');
  store.begin(job, 'mobile');
  assert.throws(() => store.finish(job));
  const token = job.token;
  job.files.push({ id: '1', name: 'cedula.pdf', size: 100, type: 'application/pdf', reviewed: true, buffer: Buffer.from('private') });
  store.finish(job);
  assert.equal(store.get('a'), job);
  assert.equal(job.status, 'complete');
  assert.equal(store.resolve(token), null);
  assert.equal('buffer' in store.snapshot(job).files[0], false);
});
test('logout revokes links and removes all user documents', () => {
  const store = new Store();
  const job = store.create('a');
  store.begin(job, 'mobile');
  const token = job.token;
  store.destroy('a');
  assert.equal(store.get('a'), undefined);
  assert.equal(store.resolve(token), null);
});
