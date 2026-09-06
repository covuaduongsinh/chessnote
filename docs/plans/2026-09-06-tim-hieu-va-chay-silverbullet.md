# Tìm hiểu, giới thiệu chi tiết và chạy thử SilverBullet ("chessnote")

## Bối cảnh

Repo `D:\code\chessnote` (tên fork của người dùng, remote `origin` trỏ tới
`github.com/covuaduongsinh/chessnote`) thực chất là mã nguồn của **SilverBullet**
(`upstream = silverbulletmd/silverbullet`) — không liên quan tới cờ vua. Đây là ứng dụng
ghi chú/knowledge-base mã nguồn mở, self-hosted, chạy trên trình duyệt, có thể lập trình
bằng một dialect Lua riêng gọi là "Space Lua".

Người dùng muốn: (1) hiểu rõ phần mềm này là gì, (2) được giới thiệu chi tiết về tính năng/
kiến trúc, và (3) thực sự **chạy được** phần mềm để trải nghiệm. Người dùng cũng đề nghị
từ nay các tài liệu kế hoạch của dự án được lưu trong `docs/plans/` ngay trong repo (thay vì
chỉ nằm ở file kế hoạch tạm của harness) — quy ước này sẽ được ghi vào memory và áp dụng
cho các plan sau này của dự án `chessnote`.

Đã khảo sát bằng 2 agent Explore song song, đọc: `README.md`, `package.json`, `Cargo.toml`,
`Makefile`, `CONTRIBUTING.md`, `docs/CHANGELOG.md`, `docs/Security.md`,
`docs/Architecture/Space Lua.md`, `docs/Deployment/Security Profiles.md`,
`client/space_lua/budget.ts`, `server/src/router.rs`, `client/components/top_bar.tsx`, cấu
trúc thư mục `client/`, `server/`, `plugs/`, `libraries/`, `e2e/`.

### Tóm tắt phần mềm

- **Bản chất**: "Programmable, Private, Browser-based, Open Source, Self-Hosted, Personal
  Knowledge Database". Nội dung là các trang Markdown ("Space"), liên kết wiki hai chiều.
- **Kiến trúc**: client-server. Backend Rust (Cargo workspace: `server`, `server-common`,
  `server-runtime-chrome`, `server-merge`, `bin/silverbullet`, `bin/sb`) dùng `axum`
  (HTTP router), `tokio`, `argon2`, `jsonwebtoken`. Frontend TypeScript, CodeMirror 6,
  **Preact** (không phải React), build bằng ESBuild, có Service Worker (PWA offline-first).
- **Tính năng nổi bật**: live-preview Markdown editor; wiki-link hai chiều; Objects & Queries
  (SLIQ — database/query ngay trong ghi chú); **Space Lua** (scripting Lua 5.4 tích hợp để
  viết Command/Template/Widget động, chạy trong `client/space_lua/`, có cả runtime phía
  server qua headless-Chrome ở `server-runtime-chrome/`); Task management; Outlining; Space
  Manager (multi-space/multi-user, phân quyền read/write); Revisions qua git; Sync engine
  offline-first.
- **Bảo mật (đang được siết chặt liên tục theo git log)**: 3 "capability endpoint" nhạy cảm
  đều yêu cầu quyền `write` — `/.shell` (chạy lệnh trên server, mặc định tắt), `/.proxy`
  (proxy HTTP ra ngoài), `/.runtime` (eval Lua/script qua headless-browser server-side);
  chống CSRF/confused-deputy trong `server/src/router.rs` (kiểm tra `Sec-Fetch-Site`/
  `Origin` cho request có session cookie); sanitize HTML khi render Markdown
  (`client/markdown_renderer/sanitize_html.ts`); "Security Profiles" khuyến nghị theo mức độ
  tin cậy triển khai (`docs/Deployment/Security Profiles.md`).
- **Commit mới nhất** (`6331add1`): `client/space_lua/budget.ts` — theo dõi CPU-time một
  script Lua chiếm dụng, tự `yield` bằng `MessageChannel` (macrotask thật, tránh ưu tiên
  cao bất thường của `scheduler.yield()`), và cảnh báo người dùng khi script chạy quá lâu/
  block main thread, thay vì làm treo editor.
- **Yêu cầu môi trường**: Node.js 24+, npm 10+, Rust toolchain (rustup, bản stable).
- Chưa có thư mục `docs/plans` trong repo — sẽ tạo mới.

### Quyết định đã chốt với người dùng

- **Space để chạy thử**: tạo một demo space mới (vài trang Markdown mẫu minh họa wiki-link,
  Space Lua, Objects/Queries, Task) thay vì dùng ghi chú có sẵn.
- **Cách build**: full release build (`make setup && make build`) rồi chạy binary
  `./target/release/silverbullet`, giống hệt bản phát hành thật (chấp nhận build Rust release
  có thể mất thời gian trên Windows).
- **Demo trực quan**: dùng Claude in Chrome để mở app, thao tác thử các tính năng chính và
  chụp ảnh minh họa, đưa vào phần giới thiệu.

## Kế hoạch thực hiện (sau khi được duyệt)

### 1. Preflight môi trường (chỉ chạy sau khi duyệt plan)

- `node --version`, `npm --version` — đối chiếu yêu cầu Node 24+/npm 10+ (có `.nvmrc` ở gốc
  repo, dùng `nvm use` nếu có nvm trên máy).
- `rustc --version`, `cargo --version` — đảm bảo có Rust toolchain (nếu thiếu, hướng dẫn cài
  qua rustup trước khi tiếp tục — đây là bước có thể cần thao tác ngoài phạm vi tự động).
- Nếu thiếu công cụ nào, báo cho người dùng và dừng lại chờ hướng dẫn thay vì tự ý cài đặt
  toolchain hệ thống.

### 2. Cài đặt & build release

```
make setup   # npm install + npx playwright install
make build   # npm run build && npm run build:plug-compile && cargo build --release -p silverbullet && cargo build --release -p sb
```

Theo dõi output để phát hiện sớm lỗi biên dịch (đặc biệt phần Rust, lần build release đầu
tiên trên máy Windows có thể chậm).

### 3. Tạo demo space

Tạo một thư mục demo space (ví dụ `demo-space/` trong scratchpad hoặc một vị trí người dùng
đồng ý, **không** commit vào repo) với vài trang mẫu:

- `Welcome.md` — trang chào, có wiki-link `[[Features]]`.
- `Features.md` — trang liên kết ngược lại `Welcome`, minh họa bi-directional link.
- `Lua Demo.md` — một block Space Lua đơn giản (ví dụ sinh nội dung động, một custom
  command) để minh họa tính năng scripting.
- `Tasks.md` — vài task `- [ ]` để minh họa task management.
- (Tùy chọn) một trang minh họa Objects/Queries (SLIQ) đơn giản.

### 4. Chạy server

```
./target/release/silverbullet <đường dẫn demo-space>
```

Xác nhận server khởi động thành công, ghi nhận cổng đang lắng nghe (mặc định 3000, kiểm tra
log/README nếu khác).

### 5. Demo trực quan bằng Claude in Chrome

- Mở `http://localhost:<port>`.
- Thao tác: mở `Welcome.md`, đi theo wiki-link, mở `Lua Demo.md` xem Space Lua chạy, thử
  Task, thử Objects/Queries nếu có, xem thử notification panel (ví dụ chạy một Lua script
  vòng lặp dài để kích hoạt cơ chế cảnh báo CPU mới từ `budget.ts`, nếu làm được an toàn).
- Chụp ảnh minh họa ở các bước quan trọng để đưa vào tài liệu giới thiệu.

### 6. Viết tài liệu giới thiệu chi tiết

Viết một tài liệu Markdown tiếng Việt tổng hợp:

- Phần mềm là gì, vì sao tên thư mục "chessnote" gây hiểu nhầm.
- Kiến trúc (client/server, stack công nghệ).
- Danh sách tính năng chính, có ảnh chụp minh họa từ bước 5.
- Cơ chế bảo mật đáng chú ý (capability endpoints, CSRF protection, security profiles).
- Cơ chế Lua budget/yield mới nhất.
- Hướng dẫn build & chạy (tóm tắt từ Makefile/README) để người dùng có thể tự chạy lại.

### 7. Lưu tài liệu kế hoạch/giới thiệu vào `docs/plans/`

- Tạo thư mục `docs/plans/` trong repo nếu chưa có.
- Lưu một bản sao của kế hoạch này (đã thực hiện) và tài liệu giới thiệu vào đó, đặt tên rõ
  ràng theo ngày, ví dụ `docs/plans/2026-09-06-tim-hieu-va-chay-silverbullet.md`.
- Ghi nhớ vào memory: từ nay, các tài liệu kế hoạch cho dự án này mặc định lưu tại
  `docs/plans/` trong repo.

## File/lệnh quan trọng

- `Makefile` — mục tiêu `setup`, `build`, `test`, `test-e2e`, `check`.
- `README.md` — hướng dẫn build/run gốc.
- `docs/Security.md`, `docs/Deployment/Security Profiles.md` — tham chiếu khi viết phần bảo
  mật.
- `client/space_lua/budget.ts`, `docs/Architecture/Space Lua.md` — tham chiếu khi viết phần
  Space Lua.
- `server/src/router.rs` — tham chiếu khi viết phần CSRF/router.

## Xác minh

- `make build` hoàn tất không lỗi, sinh ra `target/release/silverbullet`.
- Server khởi động, `http://localhost:<port>` load được UI SilverBullet.
- Mở được demo space, wiki-link hoạt động, Space Lua demo chạy ra kết quả đúng, task hiển
  thị được.
- Ảnh chụp minh họa được đính kèm trong tài liệu giới thiệu.
- File giới thiệu + bản sao kế hoạch tồn tại trong `docs/plans/`.
