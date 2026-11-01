import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeOcrDetail } from '../js/api.js';

test('describeOcrDetail dịch các mã lỗi OCR', () => {
  assert.match(describeOcrDetail('drive_not_enabled'), /Drive API/);
  assert.match(describeOcrDetail('no_permission'), /testOcr/);
  assert.match(describeOcrDetail('quota'), /hạn mức/);
  assert.match(describeOcrDetail('ocr_failed', 'abc'), /Google từ chối đọc ảnh.*abc/);
  assert.equal(describeOcrDetail(undefined), null);
  assert.equal(describeOcrDetail('lạ'), null);
});
