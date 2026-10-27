import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const sample = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');
test('preview, review, duplicate detection, deletion and ownership are enforced', async t => {
  const app = createApp({ publicBaseUrl: 'http://192.168.1.50:3000' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { app.locals.dispose(); server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function login() {
    const response = await fetch(base+'/api/login', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'admin'})});
    return response.headers.get('set-cookie').split(';')[0];
  }
  const first = await login(), second = await login();
  async function request(path, body, method='POST', cookie=first) {
    return fetch(base+path,{method,headers:{Cookie:cookie,...(body instanceof FormData ? {} : {'Content-Type':'application/json'})},body:body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body)});
  }
  function files(name='photo.png', buffer=sample) {
    const form = new FormData(); form.append('files',new Blob([buffer],{type:'application/octet-stream'}),name); return form;
  }
  const started = await request('/api/start/mobile', {});
  const token = (await started.json()).url.split('/').pop();
  const mobile = '/api/mobile/' + token;
  let result = await request(mobile + '/files', files('renamed.pdf'));
  assert.equal(result.status,200);
  const file = (await result.json()).files[0];
  assert.equal(file.type,'image/png');
  assert.equal(file.reviewed,false);
  result = await request(`/api/files/${file.id}/content`, undefined,'GET');
  assert.equal(result.headers.get('content-type'),'image/png');
  assert.deepEqual(Buffer.from(await result.arrayBuffer()),sample);
  assert.equal((await request(`/api/files/${file.id}/content`,undefined,'GET',second)).status,404);
  assert.equal((await request(`/api/files/${file.id}/review`,{},'POST',second)).status,409);
  assert.equal((await request(mobile + '/files',files('different-name.png'))).status,409);
  const mixed = files('new.pdf',Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'));
  mixed.append('files',new Blob(['corrupt'],{type:'image/png'}),'bad.png');
  assert.equal((await request(mobile + '/files',mixed)).status,400);
  assert.equal((await (await request('/api/session',undefined,'GET')).json()).files.length,1);
  assert.equal((await request(mobile + '/complete',{})).status,409);
  assert.equal((await request(`/api/files/${file.id}/review`,{})).status,200);
  assert.equal((await request(`/api/files/${file.id}`,{},'DELETE')).status,200);
  assert.equal((await request(`/api/files/${file.id}/content`,undefined,'GET')).status,404);
  assert.equal((await request(mobile + '/complete',{})).status,409);
  result = await request(mobile + '/files',files());
  const replacement = (await result.json()).files[0];
  assert.equal(replacement.reviewed,false);
  await request(`/api/files/${replacement.id}/review`,{});
  assert.equal((await request(mobile + '/complete',{})).status,200);
  assert.equal((await request(`/api/files/${replacement.id}`,{},'DELETE')).status,409);
});
