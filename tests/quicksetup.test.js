import test from 'node:test';
import assert from 'node:assert';
import { buildQuickSetupHash, parseQuickSetupHash, extractQuickSetupHash } from '../js/quicksetup.js';

const URL_OK = 'https://script.google.com/macros/s/AKfycbx_abc-123/exec';

test('khứ hồi với token ký tự đặc biệt và Unicode', () => {
  for (const token of ['abc123', 'p@ss/w+rd=?&#%', 'mật khẩu ✓ 🔑', '~!$^*()[]{}|\\"\'<>']) {
    const hash = buildQuickSetupHash(URL_OK, token);
    assert.ok(hash.startsWith('#cai-nhanh='));
    assert.match(hash.slice('#cai-nhanh='.length), /^[A-Za-z0-9_-]+$/);
    assert.deepEqual(parseQuickSetupHash(hash), { url: URL_OK, token });
  }
});

test('từ chối đầu vào hỏng', () => {
  const b64 = (o) => '#cai-nhanh=' + Buffer.from(JSON.stringify(o)).toString('base64url');
  for (const bad of [
    '', null, undefined, 42, '#nhap', '#cai-nhanh=', '#cai-nhanh=!!!', '#cai-nhanh=abc*def',
    '#cai-nhanh=' + Buffer.from('không phải json').toString('base64url'),
    b64({ u: URL_OK }), b64({ t: 'x' }), b64({ u: 1, t: 2 }), b64({ u: '', t: 'x' }), b64(null), b64([]),
  ]) {
    assert.equal(parseQuickSetupHash(bad), null, String(bad));
  }
});

test('từ chối đầu vào quá dài (>2000 ký tự)', () => {
  assert.equal(parseQuickSetupHash(buildQuickSetupHash(URL_OK, 'x'.repeat(3000))), null);
});

test('extractQuickSetupHash: URL đầy đủ, chỉ hash, chuỗi rác, rỗng', () => {
  const hash = buildQuickSetupHash(URL_OK, 'tok3n');
  assert.equal(extractQuickSetupHash(`https://user.github.io/dien-nuoc/${hash}`), hash);
  assert.equal(extractQuickSetupHash(`  ${hash}\n`), hash);
  assert.equal(extractQuickSetupHash(hash.slice(1)), hash); // thiếu '#'
  assert.deepEqual(parseQuickSetupHash(extractQuickSetupHash(`https://x/y/${hash}`)), { url: URL_OK, token: 'tok3n' });
  assert.equal(extractQuickSetupHash('hello world'), null);
  assert.equal(extractQuickSetupHash('#cai-nhanh='), null);
  assert.equal(extractQuickSetupHash(''), null);
  assert.equal(extractQuickSetupHash(null), null);
});
