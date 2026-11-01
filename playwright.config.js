// Kiểm thử giao diện (e2e) bằng Playwright. Chạy: npm run test:e2e
// Dùng trình duyệt Edge có sẵn trên Windows (channel 'msedge') nên không phải tải thêm trình duyệt.
// Muốn dùng Chromium của Playwright: chạy `npx playwright install chromium` rồi đặt PW_CHANNEL=chromium.
import { defineConfig } from '@playwright/test';

const channel = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL || 'msedge');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8765',
    channel,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/server.mjs',
    url: 'http://localhost:8765/index.html',
    reuseExistingServer: true,
  },
});
