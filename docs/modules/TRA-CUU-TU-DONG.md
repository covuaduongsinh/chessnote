# Bảng tra cứu tự động (sinh từ mã nguồn)

> **Không sửa tay file này.** Sinh bằng `python scripts/gen_module_reference.py` từ mã nguồn tại commit `383bab47be` (2026-09-13). Muốn cập nhật: chạy lại script rồi commit.

## 1. Quy mô các plug cờ vua

| Plug | Số file .ts | Dòng mã (không test) | Dòng test | Số test case |
|---|---|---|---|---|
| `plugs/chess/` | 13 | 4.222 | 732 | 56 |
| `plugs/chess-themes/` | 10 | 477 | 103 | 6 |
| `plugs/chess-engine/` | 6 | 615 | 218 | 9 |
| `plugs/chess-db/` | 13 | 1.619 | 267 | 34 |
| `plugs/chess-pdf-export/` | 4 | 465 | 313 | 25 |
| `plugs/chess-repertoire/` | 5 | 299 | 100 | 8 |
| `plugs/chess-ai/` | 17 | 1.810 | 952 | 53 |

Tổng: **9.507** dòng mã và **2.685** dòng test (191 test case) — cộng lại từ bảng trên.

## 2. Code widget (khối mã được vẽ thành giao diện)

| Khối | Plug | Hàm |
|---|---|---|
| ` ```fen ` | `chess` | `chess.ts:fenWidget` |
| ` ```pgn ` | `chess` | `chess.ts:pgnWidget` |
| ` ```puzzle ` | `chess` | `chess.ts:puzzleWidget` |

## 3. Lệnh trong Command Palette

| Lệnh | Plug | Hàm xử lý |
|---|---|---|
| `Chess: Ôn tập khai cuộc` | `chess-repertoire` | `trainer.ts:commandRepertoireTrain` |
| `Chess: Đăng nhập AI` | `chess-ai` | `bridge.ts:commandAiLogin` |
| `Chess: Đăng xuất AI` | `chess-ai` | `bridge.ts:commandAiLogout` |
| `Chess: Trạng thái AI` | `chess-ai` | `bridge.ts:commandAiStatus` |
| `Chess: Phân tích xu hướng` | `chess-ai` | `trends.ts:commandAnalyzeTrends` |
| `Chess: Thống kê khai cuộc` | `chess-ai` | `opening_stats.ts:commandOpeningStats` |
| `Chess: Tính embedding ngữ nghĩa` | `chess-ai` | `semantic_index.ts:commandComputeEmbeddings` |
| `Chess: Kiểm tra dữ liệu SQLite (debug)` | `chess-ai` | `debug_dump.ts:commandDebugDumpSql` |
| `Chess: Hỏi AI` | `chess-ai` | `qa.ts:commandAskAi` |
| `Sync: Space` | `sync` | `sync.ts:syncSpaceCommand` |
| `Sync: File` | `sync` | `sync.ts:syncFileCommand` |
| `Chess: Đăng nhập Dropbox` | `sync` | `dropbox_bridge.ts:commandDropboxLogin` |
| `Chess: Đồng bộ Dropbox` | `sync` | `dropbox_bridge.ts:commandDropboxSync` |
| `Chess: Đăng xuất Dropbox` | `sync` | `dropbox_bridge.ts:commandDropboxLogout` |
| `Chess: Chẩn đoán đồng bộ Dropbox (không ghi gì)` | `sync` | `dropbox_bridge.ts:commandDropboxDiagnose` |
| `Chess: Đăng nhập WebDAV` | `sync` | `webdav_bridge.ts:commandWebDavLogin` |
| `Chess: Đồng bộ WebDAV` | `sync` | `webdav_bridge.ts:commandWebDavSync` |
| `Chess: Đăng xuất WebDAV` | `sync` | `webdav_bridge.ts:commandWebDavLogout` |
| `Chess: Trạng thái đồng bộ` | `sync` | `auto_trigger.ts:commandSyncStatus` |
| `Chess: Mở khoá mã hoá đồng bộ` | `sync` | `e2ee_bridge.ts:commandE2eeUnlock` |
| `Chess: Khoá lại mã hoá đồng bộ` | `sync` | `e2ee_bridge.ts:commandE2eeLock` |

Tổng: 21 lệnh.

## 4. Syscall các plug cung cấp (gọi xuyên plug)

| Syscall | Plug cung cấp | Hàm |
|---|---|---|
| `chess.legalMoves` | `chess` | `chess.ts:legalMoves` |
| `chess.applyMove` | `chess` | `chess.ts:applyMove` |
| `chess.applySan` | `chess` | `chess.ts:applySan` |
| `chess.renderStaticBoardHtml` | `chess` | `board_renderer.ts:renderStaticBoardHtml` |
| `chess.getCss` | `chess` | `board_renderer.ts:getChessCss` |
| `chess.extractChessGames` | `chess` | `index.ts:extractChessGames` |
| `chess.textExtractKeywords` | `chess` | `text_normalize.ts:extractKeywords` |
| `chess.isRepertoirePage` | `chess` | `index.ts:isRepertoirePage` |
| `chess.themes.getPieceSet` | `chess-themes` | `piece_sets.ts:getPieceSet` |
| `chess.themes.getAllPieceSets` | `chess-themes` | `piece_sets.ts:getAllPieceSets` |
| `chess.themes.getBoardTheme` | `chess-themes` | `board_themes.ts:getBoardTheme` |
| `chess.themes.getAllBoardThemes` | `chess-themes` | `board_themes.ts:getAllBoardThemes` |
| `chess.themes.generateBoardThemeCss` | `chess-themes` | `board_themes.ts:generateBoardThemeCss` |
| `chess.engineEval` | `chess-engine` | `arasan_engine.ts:evalPosition` |
| `chess.reviewGame` | `chess-engine` | `game_reviewer.ts:reviewGame` |
| `chess.engine.buildMoveList` | `chess-engine` | `game_reviewer.ts:buildMoveList` |
| `chessSql.upsertGames` | `chess-db` | `index.ts:upsertGames` |
| `chessSql.deleteGamesForPage` | `chess-db` | `index.ts:deleteGamesForPage` |
| `chessSql.queryOpeningStats` | `chess-db` | `index.ts:queryOpeningStats` |
| `chessSql.searchGames` | `chess-db` | `index.ts:searchGames` |
| `chessSql.queryRelatedGames` | `chess-db` | `index.ts:queryRelatedGames` |
| `chessSql.upsertAiAnnotation` | `chess-db` | `index.ts:upsertAiAnnotation` |
| `chessSql.syncAiAnnotationFromFrontmatter` | `chess-db` | `index.ts:syncAiAnnotationFromFrontmatter` |
| `chessSql.deleteAiAnnotationsForPage` | `chess-db` | `index.ts:deleteAiAnnotationsForPage` |
| `chessSql.syncRepertoireLinesForPage` | `chess-db` | `index.ts:syncRepertoireLinesForPage` |
| `chessSql.deleteRepertoireLinesForPage` | `chess-db` | `index.ts:deleteRepertoireLinesForPage` |
| `chessSql.deleteEmbeddingsForPage` | `chess-db` | `index.ts:deleteEmbeddingsForPage` |
| `chessSql.getDueRepertoireLines` | `chess-db` | `index.ts:getDueRepertoireLines` |
| `chessSql.recordRepertoireReview` | `chess-db` | `index.ts:recordRepertoireReview` |
| `chessSql.debugDump` | `chess-db` | `index.ts:debugDump` |
| `chessEmbedding.computeForGame` | `chess-db` | `index.ts:computeForGame` |
| `chessEmbedding.hasAnyEmbeddings` | `chess-db` | `index.ts:hasAnyEmbeddings` |
| `chessEmbedding.search` | `chess-db` | `index.ts:search` |
| `chess.renderPageForPdf` | `chess-pdf-export` | `pdf_export.ts:renderPageForPdf` |
| `chess.ai.status` | `chess-ai` | `bridge.ts:aiStatus` |
| `chess.ai.authStart` | `chess-ai` | `bridge.ts:aiAuthStart` |
| `chess.ai.authCode` | `chess-ai` | `bridge.ts:aiAuthCode` |
| `chess.ai.authLogout` | `chess-ai` | `bridge.ts:aiAuthLogout` |
| `chess.ai.authCancel` | `chess-ai` | `bridge.ts:aiAuthCancel` |
| `chess.ai.ask` | `chess-ai` | `bridge.ts:aiAsk` |
| `chess.ai.explainMove` | `chess-ai` | `coach.ts:explainMove` |
| `chess.ai.annotateGame` | `chess-ai` | `coach.ts:annotateGame` |
| `chess.ai.suggestTags` | `chess-ai` | `tagging.ts:suggestTags` |
| `chess.applyTagSuggestion` | `chess-ai` | `tagging.ts:applyTagSuggestion` |

Tổng: 44 syscall.

## 5. Sự kiện (event) plug đăng ký lắng nghe

| Sự kiện | Plug | Hàm |
|---|---|---|
| `page:index` | `chess` | `index.ts:indexChessGames` |
| `page:deleted` | `chess` | `index.ts:deleteChessGamesForPage` |
| `page:index` | `chess-repertoire` | `index.ts:indexRepertoireLines` |
| `editor:init` | `chess-ai` | `bridge.ts:initAiConfig` |
| `"service-worker:space-sync-complete"` | `sync` | `sync.ts:spaceSyncComplete` |
| `"service-worker:file-sync-complete"` | `sync` | `sync.ts:fileSyncComplete` |
| `"service-worker:sync-status"` | `sync` | `sync.ts:updateSyncStatus` |
| `editor:init` | `sync` | `dropbox_bridge.ts:initDropboxConfig` |
| `editor:init` | `sync` | `webdav_bridge.ts:initWebDavConfig` |
| `editor:init` | `sync` | `auto_trigger.ts:initAutoTrigger` |
| `page:saved` | `sync` | `auto_trigger.ts:onPageSaved` |
| `editor:activityResumed` | `sync` | `auto_trigger.ts:runAllConfiguredSyncs` |
| `editor:init` | `sync` | `e2ee_bridge.ts:initE2eeConfig` |
| `editor:init` | `sync` | `push_trigger.ts:initPushTrigger` |
## 6. Khóa cấu hình khai báo bằng `config.define`

| Khóa | Mặc định (trích nguyên văn) | Khai báo tại |
|---|---|---|
| `chess.ai.apiKey` | `""` | `plugs/chess-ai/bridge.ts` |
| `chess.ai.mode` | `"api_key"` | `plugs/chess-ai/bridge.ts` |
| `chess.ai.model` | `"claude-haiku-4-5-20251001"` | `plugs/chess-ai/bridge.ts` |
| `chess.ai.sidecarToken` | `""` | `plugs/chess-ai/bridge.ts` |
| `chess.ai.sidecarUrl` | `DEFAULT_SIDECAR_URL` | `plugs/chess-ai/bridge.ts` |
| `chess.dropbox.appKey` | `""` | `plugs/sync/dropbox_bridge.ts` |
| `chess.dropbox.folder` | `""` | `plugs/sync/dropbox_bridge.ts` |
| `chess.sync.autoIntervalMinutes` | `5` | `plugs/sync/auto_trigger.ts` |
| `chess.sync.e2ee.enabled` | `false` | `plugs/sync/e2ee_bridge.ts` |
| `chess.webdav.enableRealtimePush` | `false` | `plugs/sync/push_trigger.ts` |
| `chess.webdav.folder` | `""` | `plugs/sync/webdav_bridge.ts` |
| `chess.webdav.url` | `""` | `plugs/sync/webdav_bridge.ts` |

Ngoài ra `chess.pieceSet`, `chess.boardTheme`, `chess.playerName` được đọc bằng `system.getConfig` (chưa qua `config.define`) — xem `plugs/chess/chess.ts`, `plugs/chess-ai/opening_stats.ts`.

## 7. Bảng SQLite (plug `chess-db`)

`chess_games`, `ai_annotations`, `ai_annotation_tags`, `repertoire_lines`, `game_embeddings`, `chess_games_fts` — 6 bảng (kể cả bảng ảo FTS5).

## 8. Dịch vụ Node (ai-sidecar, cloud-server)

| File | Dòng |
|---|---|
| `ai-sidecar/src/auth.ts` | 313 |
| `ai-sidecar/src/concurrency.test.ts` | 73 |
| `ai-sidecar/src/concurrency.ts` | 48 |
| `ai-sidecar/src/kill-tree.ts` | 70 |
| `ai-sidecar/src/mode.ts` | 16 |
| `ai-sidecar/src/model.test.ts` | 58 |
| `ai-sidecar/src/model.ts` | 119 |
| `ai-sidecar/src/server.test.ts` | 133 |
| `ai-sidecar/src/server.ts` | 155 |
| `ai-sidecar/src/utf8-stream.ts` | 32 |
| `cloud-server/src/auth.test.ts` | 78 |
| `cloud-server/src/auth.ts` | 90 |
| `cloud-server/src/push.test.ts` | 94 |
| `cloud-server/src/push.ts` | 60 |
| `cloud-server/src/push_integration.test.ts` | 138 |
| `cloud-server/src/server.ts` | 284 |
| `cloud-server/src/storage.test.ts` | 138 |
| `cloud-server/src/storage.ts` | 180 |
| `cloud-server/src/webdav_integration.test.ts` | 138 |
| `cloud-server/src/webdav_xml.test.ts` | 61 |
| `cloud-server/src/webdav_xml.ts` | 60 |

## 9. Plug `sync` (không tính test)

| File | Dòng |
|---|---|
| `plugs/sync/auto_trigger.ts` | 130 |
| `plugs/sync/dropbox_bridge.ts` | 251 |
| `plugs/sync/dropbox_provider.ts` | 45 |
| `plugs/sync/dropbox_sync.ts` | 502 |
| `plugs/sync/e2ee.ts` | 178 |
| `plugs/sync/e2ee_bridge.ts` | 85 |
| `plugs/sync/push_trigger.ts` | 136 |
| `plugs/sync/sync.ts` | 64 |
| `plugs/sync/sync_engine.ts` | 612 |
| `plugs/sync/sync_provider.ts` | 73 |
| `plugs/sync/webdav_bridge.ts` | 154 |
| `plugs/sync/webdav_provider.ts` | 44 |
| `plugs/sync/webdav_sync.ts` | 288 |

Tổng: 2562 dòng.

