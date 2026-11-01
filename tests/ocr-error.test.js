import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { describeOcrDetail } from '../js/api.js';

test('describeOcrDetail dịch các mã lỗi OCR', () => {
  assert.match(describeOcrDetail('drive_not_enabled'), /Drive API/);
  assert.match(describeOcrDetail('no_permission'), /testOcr/);
  assert.match(describeOcrDetail('quota'), /hạn mức/);
  assert.match(describeOcrDetail('rate_limited'), /giới hạn tốc độ/);
  assert.match(describeOcrDetail('ocr_failed', 'abc'), /Google từ chối đọc ảnh.*\(Chi tiết từ Google: abc\)/);
  assert.match(describeOcrDetail('drive_rejected', 'xyz'), /Chi tiết từ Google: xyz/);
  assert.match(describeOcrDetail('quota', 'Daily Limit'), /Chi tiết từ Google: Daily Limit/);
  assert.match(describeOcrDetail('rate_limited', 'User Rate Limit'), /Chi tiết từ Google: User Rate Limit/);
  assert.doesNotMatch(describeOcrDetail('quota'), /Chi tiết/);
  assert.equal(describeOcrDetail(undefined), null);
  assert.equal(describeOcrDetail('lạ'), null);
});

// Nạp các hàm thuần phân loại lỗi từ Code.gs (không có API Apps Script nên chỉ trích đoạn cần).
function loadGsHelpers() {
  const src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
  const pick = (re) => {
    const m = src.match(re);
    assert.ok(m, 'không tìm thấy ' + re);
    return m[0];
  };
  const code = [
    pick(/var OCR_RATE_LIMIT_RE_ = [^\n]+/),
    pick(/function isRetryableOcrError_[\s\S]*?\n}\n/),
    pick(/function classifyOcrError_[\s\S]*?\n}\n/),
  ].join('\n');
  const ctx = {};
  vm.runInNewContext(code + '\nthis.classify = classifyOcrError_; this.retry = isRetryableOcrError_;', ctx);
  return ctx;
}

test('classifyOcrError_ tách rate_limited và quota; chỉ retry lỗi tạm', () => {
  const { classify, retry } = loadGsHelpers();
  const E = (m) => new Error(m);
  assert.equal(classify(E('User Rate Limit Exceeded')), 'rate_limited');
  assert.equal(classify(E('Rate Limit Exceeded')), 'rate_limited');
  assert.equal(classify(E('Backend Error')), 'rate_limited');
  assert.equal(classify(E('Daily Limit Exceeded')), 'quota');
  assert.equal(classify(E('Quota exceeded for quota metric')), 'quota');
  assert.equal(classify(E('You do not have permission')), 'no_permission');
  assert.equal(classify(E('Invalid argument')), 'drive_rejected');
  assert.equal(retry(E('User Rate Limit Exceeded')), true);
  assert.equal(retry(E('Internal Error')), true);
  assert.equal(retry(E('Daily Limit Exceeded')), false);
  assert.equal(retry(E('Invalid argument')), false);
  assert.equal(retry(E('Authorization required')), false);
});
