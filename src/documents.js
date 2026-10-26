import { createHash } from 'node:crypto';

/** Basic container checks, independent of the filename and browser MIME declaration.
 * These checks do not establish authenticity, readability or legal validity.
 */
export function inspectDocument(buffer) {
  const ascii = (start, end) => buffer.toString('ascii', start, end);
  if (buffer.length >= 20 && /^%PDF-1\.[0-7]|^%PDF-2\.0/.test(ascii(0, 8)) && /%%EOF\s*$/.test(buffer.subarray(-1024).toString('latin1'))) return 'application/pdf';
  if (buffer.length >= 45 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && ascii(12,16) === 'IHDR' && buffer.readUInt32BE(8) === 13 && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0 && buffer.subarray(-12).equals(Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130]))) return 'image/png';
  if (buffer.length >= 20 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer.at(-2) === 255 && buffer.at(-1) === 217) return 'image/jpeg';
  if (buffer.length >= 30 && ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(ascii(12,16)) && buffer.readUInt32LE(4) + 8 === buffer.length) return 'image/webp';
  if (buffer.length >= 24 && ascii(4,8) === 'ftyp') {
    const boxSize = buffer.readUInt32BE(0);
    if (boxSize < 16 || boxSize > buffer.length || boxSize % 4) return null;
    const brands = [ascii(8,12)];
    for (let i = 16; i < boxSize; i += 4) brands.push(ascii(i,i+4));
    if (brands.some(brand => ['heic','heix','hevc','hevx'].includes(brand))) return 'image/heic';
    if (brands.some(brand => ['mif1','msf1'].includes(brand))) return 'image/heif';
  }
  return null;
}

export function documentHash(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
