# Graph Report - dien-nuoc-github  (2026-11-01)

## Corpus Check
- 31 files · ~27,070 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 275 nodes · 799 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 11 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- input-tracker.js
- parser.js
- plan.md: Ứng dụng quản lý hoá đơn điện, nước cho khách thuê
- settings.js
- data.js
- main.js
- format.js
- Quản lý hoá đơn điện, nước cho khách thuê
- input.js
- appsscript.json
- package.json

## God Nodes (most connected - your core abstractions)
1. `h()` - 37 edges
2. `render()` - 35 edges
3. `render()` - 28 edges
4. `getState()` - 23 edges
5. `toast()` - 21 edges
6. `render()` - 19 edges
7. `formatMoney()` - 17 edges
8. `formatPeriod()` - 17 edges
9. `setState()` - 17 edges
10. `isConfigured()` - 16 edges

## Surprising Connections (you probably didn't know these)
- `paintQr()` --calls--> `h()`  [EXTRACTED]
  js/pages/settings.js → js/dom.js
- `updateTotals()` --indirect_call--> `formatPeriod()`  [INFERRED]
  js/pages/input.js → js/format.js
- `onPeriodChange()` --calls--> `setState()`  [EXTRACTED]
  js/main.js → js/state.js
- `syncLock()` --calls--> `getState()`  [EXTRACTED]
  js/pages/settings.js → js/state.js
- `reloadAll()` --calls--> `isConfigured()`  [EXTRACTED]
  js/data.js → js/api.js

## Import Cycles
- None detected.

## Communities (11 total, 1 thin omitted)

### Community 0 - "input-tracker.js"
Cohesion: 0.11
Nodes (54): appendChildren(), h(), ICONS, PROP_KEYS, svg(), formatDate(), formatMoney(), formatNumber() (+46 more)

### Community 1 - "parser.js"
Cohesion: 0.23
Nodes (18): amountFromColumns(), codeAfterLabel(), firstGroup(), foldWithMap(), isNumericLine(), normalize(), numberTokens(), ocrNumber() (+10 more)

### Community 2 - "plan.md: Ứng dụng quản lý hoá đơn điện, nước cho khách thuê"
Cohesion: 0.06
Nodes (34): 10. Xử lý lỗi và trường hợp biên, 11. Tiêu chí nghiệm thu, 12. Lộ trình thực hiện (dừng và chờ tôi duyệt sau mỗi Phase), 13. Việc không làm trong phạm vi này, 1. Mục tiêu, 2. Quyết định đã chốt, 3. Ràng buộc và bảo mật (bắt buộc tuân thủ), 4.1 Design tokens (đặt trong `css/tokens.css`) (+26 more)

### Community 3 - "settings.js"
Cohesion: 0.11
Nodes (35): ALLOWED_HOSTS, call(), deleteInvoice(), describeOcrDetail(), isAllowedUrl(), isConfigured(), markNotified(), ocrImage() (+27 more)

### Community 4 - "data.js"
Cohesion: 0.22
Nodes (11): ApiError, getAll(), errorMessage(), invoiceFromRow(), invoiceToRow(), num(), reloadAll(), unitFromRow() (+3 more)

### Community 5 - "main.js"
Cohesion: 0.12
Nodes (22): CONNECTION_TEXT, connectionEl, DATA_KEYS, navigate(), onPeriodChange(), pageTitle, periodInput, renderRoute() (+14 more)

### Community 6 - "format.js"
Cohesion: 0.27
Nodes (10): defaultDueDate(), nextPeriod(), previousPeriod(), transferContent(), defaultPeriod(), listeners, state, STORAGE_TOKEN (+2 more)

### Community 7 - "Quản lý hoá đơn điện, nước cho khách thuê"
Cohesion: 0.11
Nodes (17): 10. Bảo mật, 11. Xử lý sự cố thường gặp, 12. Checklist nghiệm thu, 1. Tạo Google Sheet, 2. Dán mã Apps Script, 3. Đặt mã bí mật `API_TOKEN`, 4. Chạy hàm `setup` một lần, 5. Triển khai Web app (+9 more)

### Community 8 - "input.js"
Cohesion: 0.18
Nodes (23): icon(), ALLOWED_IMAGE_TYPES, ImageError, loadImage(), MAX_SOURCE_BYTES, prepareImage(), validateImageFile(), clean() (+15 more)

### Community 9 - "appsscript.json"
Cohesion: 0.15
Nodes (12): dependencies, enabledAdvancedServices, exceptionLogging, oauthScopes, runtimeVersion, timeZone, webapp, access (+4 more)

## Knowledge Gaps
- **80 isolated node(s):** `timeZone`, `exceptionLogging`, `runtimeVersion`, `https://www.googleapis.com/auth/spreadsheets`, `https://www.googleapis.com/auth/drive` (+75 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `render()` connect `input.js` to `input-tracker.js`, `parser.js`, `settings.js`, `data.js`, `main.js`, `format.js`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `h()` connect `input-tracker.js` to `input.js`, `settings.js`, `main.js`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `getState()` connect `input.js` to `input-tracker.js`, `settings.js`, `data.js`, `main.js`, `format.js`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `timeZone`, `exceptionLogging`, `runtimeVersion` to the rest of the system?**
  _80 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `input-tracker.js` be split into smaller, more focused modules?**
  _Cohesion score 0.11369645690111052 - nodes in this community are weakly interconnected._
- **Should `plan.md: Ứng dụng quản lý hoá đơn điện, nước cho khách thuê` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._
- **Should `settings.js` be split into smaller, more focused modules?**
  _Cohesion score 0.10569105691056911 - nodes in this community are weakly interconnected._