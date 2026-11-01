# Graph Report - dien-nuoc-github  (2026-11-01)

## Corpus Check
- 30 files · ~25,523 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 261 nodes · 725 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- h
- input.js
- plan.md: Ứng dụng quản lý hoá đơn điện, nước cho khách thuê
- settings.js
- api.js
- main.js
- notice-page.js
- Quản lý hoá đơn điện, nước cho khách thuê
- render
- appsscript.json
- package.json

## God Nodes (most connected - your core abstractions)
1. `h()` - 36 edges
2. `render()` - 35 edges
3. `render()` - 28 edges
4. `getState()` - 20 edges
5. `render()` - 19 edges
6. `formatMoney()` - 17 edges
7. `formatPeriod()` - 17 edges
8. `toast()` - 17 edges
9. `isConfigured()` - 16 edges
10. `render()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `render()` --indirect_call--> `unitToRow()`  [INFERRED]
  js/pages/settings.js → js/data.js
- `paintQr()` --calls--> `h()`  [EXTRACTED]
  js/pages/settings.js → js/dom.js
- `updateTotals()` --indirect_call--> `formatPeriod()`  [INFERRED]
  js/pages/input.js → js/format.js
- `onPeriodChange()` --calls--> `setState()`  [EXTRACTED]
  js/main.js → js/state.js
- `syncLock()` --calls--> `getState()`  [EXTRACTED]
  js/pages/settings.js → js/state.js

## Import Cycles
- None detected.

## Communities (11 total, 1 thin omitted)

### Community 0 - "h"
Cohesion: 0.15
Nodes (31): appendChildren(), h(), ICONS, PROP_KEYS, svg(), formatMoney(), formatNumber(), cell() (+23 more)

### Community 1 - "input.js"
Cohesion: 0.12
Nodes (30): formatNumberOrDash(), invoiceKey(), ALLOWED_IMAGE_TYPES, ImageError, loadImage(), MAX_SOURCE_BYTES, prepareImage(), validateImageFile() (+22 more)

### Community 2 - "plan.md: Ứng dụng quản lý hoá đơn điện, nước cho khách thuê"
Cohesion: 0.06
Nodes (34): 10. Xử lý lỗi và trường hợp biên, 11. Tiêu chí nghiệm thu, 12. Lộ trình thực hiện (dừng và chờ tôi duyệt sau mỗi Phase), 13. Việc không làm trong phạm vi này, 1. Mục tiêu, 2. Quyết định đã chốt, 3. Ràng buộc và bảo mật (bắt buộc tuân thủ), 4.1 Design tokens (đặt trong `css/tokens.css`) (+26 more)

### Community 3 - "settings.js"
Cohesion: 0.15
Nodes (23): errorMessage(), compressQr(), CONNECTION_LABEL, render(), paintQr(), paintRows(), runMatchTest(), storeCredentials() (+15 more)

### Community 4 - "api.js"
Cohesion: 0.13
Nodes (19): ALLOWED_HOSTS, ApiError, call(), deleteInvoice(), describeOcrDetail(), getAll(), ocrImage(), ping() (+11 more)

### Community 5 - "main.js"
Cohesion: 0.12
Nodes (23): isAllowedUrl(), saveConnection(), invalidateData(), applyQuickSetup(), CONNECTION_TEXT, connectionEl, DATA_KEYS, navigate() (+15 more)

### Community 6 - "notice-page.js"
Cohesion: 0.21
Nodes (21): defaultDueDate(), formatDate(), formatPeriod(), nextPeriod(), previousPeriod(), transferContent(), buildNoticeNode(), copyPngToClipboard() (+13 more)

### Community 7 - "Quản lý hoá đơn điện, nước cho khách thuê"
Cohesion: 0.12
Nodes (16): 10. Bảo mật, 11. Xử lý sự cố thường gặp, 12. Checklist nghiệm thu, 1. Tạo Google Sheet, 2. Dán mã Apps Script, 3. Đặt mã bí mật `API_TOKEN`, 4. Chạy hàm `setup` một lần, 5. Triển khai Web app (+8 more)

### Community 8 - "render"
Cohesion: 0.34
Nodes (15): isConfigured(), icon(), render(), buildImageItem(), buildItem(), paintMatch(), clearImage(), periodOfRow() (+7 more)

### Community 9 - "appsscript.json"
Cohesion: 0.15
Nodes (12): dependencies, enabledAdvancedServices, exceptionLogging, oauthScopes, runtimeVersion, timeZone, webapp, access (+4 more)

## Knowledge Gaps
- **77 isolated node(s):** `timeZone`, `exceptionLogging`, `runtimeVersion`, `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive` (+72 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `render()` connect `render` to `h`, `input.js`, `settings.js`, `api.js`, `main.js`, `notice-page.js`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `h()` connect `h` to `input.js`, `settings.js`, `main.js`, `notice-page.js`, `render`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `render()` connect `settings.js` to `h`, `api.js`, `main.js`, `notice-page.js`, `render`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `timeZone`, `exceptionLogging`, `runtimeVersion` to the rest of the system?**
  _77 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `input.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12063492063492064 - nodes in this community are weakly interconnected._
- **Should `plan.md: Ứng dụng quản lý hoá đơn điện, nước cho khách thuê` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `settings.js` be split into smaller, more focused modules?**
  _Cohesion score 0.1452991452991453 - nodes in this community are weakly interconnected._