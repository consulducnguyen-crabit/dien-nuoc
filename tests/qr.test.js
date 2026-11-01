import test from 'node:test';
import assert from 'node:assert';
import { splitQr, joinQr, isImageDataUrl, qrFromConfig, qrToConfig, QR_PART_SIZE } from '../js/qr.js';

const url = `data:image/webp;base64,${'A'.repeat(95000)}`;

test('splitQr/joinQr: chia mảnh <= 40.000 và ghép lại nguyên vẹn', () => {
  const parts = splitQr(url);
  assert.equal(parts.length, 3);
  assert.ok(parts.every((p) => p.length <= QR_PART_SIZE));
  assert.equal(joinQr(parts), url);
});

test('joinQr từ chối chuỗi không phải data URL ảnh', () => {
  assert.equal(joinQr(['javascript:alert(1)']), '');
  assert.equal(joinQr(['data:text/html;base64,AAAA']), '');
  assert.equal(isImageDataUrl('https://x.y/a.png'), false);
});

test('qrToConfig/qrFromConfig khứ hồi; xoá QR -> qr_parts = 0', () => {
  const cfg = qrToConfig(url);
  assert.equal(cfg.qr_parts, 3);
  assert.equal(qrFromConfig(cfg), url);
  assert.deepEqual(qrToConfig(''), { qr_parts: 0 });
  assert.equal(qrFromConfig({ qr_parts: '0' }), '');
});

test('qrFromConfig: thiếu mảnh -> rỗng', () => {
  const cfg = qrToConfig(url);
  delete cfg.qr_part_1;
  assert.equal(qrFromConfig(cfg), '');
});
