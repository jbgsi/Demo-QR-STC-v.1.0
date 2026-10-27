import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDocument, documentHash } from '../src/documents.js';

export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=', 'base64');
test('recognizes PNG content and rejects incomplete or disguised files', () => {
  assert.equal(inspectDocument(png), 'image/png');
  assert.equal(inspectDocument(png.subarray(0,40)), null);
  assert.equal(inspectDocument(Buffer.from('<html>renamed as an image</html>')), null);
  assert.equal(inspectDocument(Buffer.from('%PDF-1.7\ntruncated')), null);
  assert.equal(inspectDocument(Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')), 'application/pdf');
});
test('duplicate detection uses content instead of filenames', () => {
  assert.equal(documentHash(png), documentHash(Buffer.from(png)));
  assert.notEqual(documentHash(png), documentHash(Buffer.from('other content')));
});
