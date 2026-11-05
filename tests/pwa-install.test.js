import test from 'node:test';
import assert from 'node:assert';
import { detectPlatform } from '../js/pwa-install.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESKTOP_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

test('iPhone Safari -> ios', () => {
  assert.equal(detectPlatform({ userAgent: IPHONE, maxTouchPoints: 5 }), 'ios');
});

test('iPad giả Mac (maxTouchPoints 5) -> ios; Mac thật (0) -> other', () => {
  assert.equal(detectPlatform({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }), 'ios');
  assert.equal(detectPlatform({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }), 'other');
});

test('Android Chrome: có prompt -> prompt, không -> other', () => {
  assert.equal(detectPlatform({ userAgent: ANDROID, maxTouchPoints: 5, hasPrompt: true }), 'prompt');
  assert.equal(detectPlatform({ userAgent: ANDROID, maxTouchPoints: 5 }), 'other');
});

test('trình duyệt trong ứng dụng (Zalo, FBAN) -> inapp, kể cả trên iPhone', () => {
  assert.equal(detectPlatform({ userAgent: `${ANDROID} Zalo/1.0` }), 'inapp');
  assert.equal(detectPlatform({ userAgent: `${IPHONE} [FBAN/FBIOS;FBAV/400]`, maxTouchPoints: 5 }), 'inapp');
});

test('standalone -> installed, ưu tiên hơn prompt/ios/inapp', () => {
  assert.equal(detectPlatform({ userAgent: IPHONE, standalone: true, hasPrompt: true }), 'installed');
  assert.equal(detectPlatform({ userAgent: `${ANDROID} Zalo/1.0`, standalone: true }), 'installed');
});

test('desktop Edge không prompt -> other', () => {
  assert.equal(detectPlatform({ userAgent: DESKTOP_EDGE }), 'other');
});
