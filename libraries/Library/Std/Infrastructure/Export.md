---
description: Implements the infrastructure of the Export commands.
tags: meta
---
Provides infrastructure for exporting pages outside of your space. It standardizes the ${widgets.commandButton("Export: Page Or Selection")} to export the current page or selection in various ways.

# Architecture
Flow:

1. Service discovery with `export` selector with data:
  * `pageMeta`
  * `text` (either the selection text or the entire page text)
2. Respond with:
  * `name`
  * `description`
  * `priority`
3. Ask user to select option, then invokes the selected service.

# Implementation
```space-lua
-- priority: 10
command.define {
  name = "Export: Page Or Selection",
  key = "Ctrl-e",
  mac = "Cmd-e",
  run = function()
    editor.save()
    local text = editor.getText()
    local meta = editor.getCurrentPageMeta()
    local selection = editor.getSelection()
    local exportObj = {
      pageMeta = meta,
      text = selection.text != "" and selection.text or text
    }
    local services = service.discover("export", exportObj)
    if #services == 0 then
      editor.flashNotification("No exporters available", "error")
      return
    end
    local selectedOption = editor.filterBox("Export to",
      services, "Select your export mechanism")
    if not selectedOption then
      return
    end
    -- Bug thật phát hiện qua kiểm chứng tay: nếu 1 service (ví dụ PDF, khi
    -- headless Chrome không khởi động được) throw, lỗi đó KHÔNG hề hiện ra
    -- cho người dùng -- không có thông báo gì cả, cứ như không bấm gì. Bọc
    -- pcall để LUÔN có phản hồi, giống mẫu đã dùng ở Github.md/Share.md.
    local ok, err = pcall(function() service.invoke(selectedOption, exportObj) end)
    if not ok then
      editor.flashNotification("Export failed: " .. tostring(err), "error")
    end
  end
}
```

# Clipboard exporters
Implements two exporters:
* Copy rich text (e.g. for pasting into a Google Docs)
* Copy clean markdown

```space-lua
-- priority: 10
service.define {
  selector = "export",
  match = {
    name = "Clipboard: Export Rich Text",
    description = "To paste into Google Docs or other WYSIWYG environment"
  },
  run = function(data)
    local mdTree = markdown.parseMarkdown(data.text)
    mdTree = markdown.expandMarkdown(mdTree)
    local html = markdown.markdownToHtml(markdown.renderParseTree(mdTree))
    editor.copyToClipboard(js.new(js.window.Blob, {html}, {type="text/html"}))
  end
}

service.define {
  selector = "export",
  match = {
    name = "Clipboard: Export Clean Markdown",
    description = "To paste into another markdown supporting tool"
  },
  run = function(data)
    local mdTree = markdown.parseMarkdown(data.text)
    mdTree = markdown.expandMarkdown(mdTree)
    local renderedMd = markdown.renderParseTree(mdTree)
    editor.copyToClipboard(renderedMd)
  end
}
```

# PDF exporter
Renders the page to a print-ready PDF: chess boards (`fen`/`pgn`/`puzzle` blocks) as static images instead of the live interactive iframe (with no raw FEN text printed underneath — the board already shows the position), and automatic page numbers. Default column layout is 2 columns and default board size is 400px (both configurable via `pdfExport.columns`/`pdfExport.boardSize` in `CONFIG.md` or the Configuration Manager). Pagination is pre-computed server-side by `chess.renderPageForPdf` (see `plugs/chess/pdf_pagination.ts`) rather than left to a CSS `column-count` layout: Chrome's print-to-PDF doesn't reliably honor `break-inside: avoid` for an element inside a CSS multi-column layout that's *also* being fragmented into physical pages (a known Chromium limitation with nested fragmentation contexts), so each physical page's column(s) are assembled ahead of time from estimated block heights, guaranteeing a board never gets split across a page even though column heights are no longer perfectly balanced the way native `column-fill: auto` used to make them (for a particularly board-heavy page, 1 column and/or a smaller board size still reads better and also saves paper when printing). Add `pdfColumns: 1|2` and/or `pdfBoardSize: <px>` to a page's frontmatter to override either default for that one page. The board rendering and pagination live in the `chess` plug (`chess.renderPageForPdf`, see `plugs/chess/pdf_export.ts`/`pdf_pagination.ts`) since board rendering needs `chess.js`; the actual PDF rendering (headless Chrome — the server's `/.export/pdf`, or the desktop app's own `export_pdf` Tauri command) lives behind `editor.exportPdf`, which also picks whichever of those two the current environment has.

```space-lua
-- priority: 10
config.defineCategory {
  name = "Export",
  description = "Tuỳ chọn khi xuất trang, ví dụ xuất PDF.",
  priority = 20,
}

config.define("pdfExport", {
  type = "object",
  properties = {
    columns = {
      type = "number",
      default = 2,
      description = "Số cột mặc định khi xuất PDF. Ghi đè cho một trang cụ thể bằng frontmatter `pdfColumns`.",
      ui = { category = "Export", label = "Số cột PDF mặc định", priority = 1 },
    },
    boardSize = {
      type = "number",
      default = 400,
      minimum = 150,
      maximum = 700,
      description = "Kích thước (px) bàn cờ khi xuất PDF, để giảm bớt nếu muốn tiết kiệm giấy in. Ghi đè cho một trang cụ thể bằng frontmatter `pdfBoardSize`.",
      ui = { category = "Export", label = "Kích thước bàn cờ khi xuất PDF (px)", priority = 2 },
    },
  }
})

-- Bản mobile (Capacitor, Android/iOS) không có server nền — editor.exportPdf sẽ
-- gọi fetch tới chính WebView cục bộ (không có route đó) và báo lỗi mạng khó
-- hiểu. Không đăng ký service này trên Capacitor để "Export: Page Or Selection"
-- đơn giản là không hiện tuỳ chọn PDF nữa, thay vì hiện ra rồi báo lỗi.
if not system.isCapacitor() then
  service.define {
    selector = "export",
    match = {
      name = "PDF: Xuất file PDF",
      description = "Xuất trang hiện tại ra PDF (mặc định 2 cột & bàn cờ 400px, chỉnh trong CONFIG.md hoặc Configuration Manager; ghi đè theo từng trang bằng frontmatter pdfColumns/pdfBoardSize, bàn cờ dạng ảnh tĩnh, đánh số trang tự động)"
    },
    run = function(data)
      local defaultBoardSize = config.get("pdfExport.boardSize", 400)
      local boardSize = data.pageMeta.pdfBoardSize or defaultBoardSize
      local defaultColumns = config.get("pdfExport.columns", 2)
      local columns = data.pageMeta.pdfColumns or defaultColumns
      local boardHtml = chess.renderPageForPdf(data.text, boardSize, columns)
      local pageName = data.pageMeta.name or "export"
      local safeName = string.gsub(pageName, "/", "_")
      local fullHtml = "<!doctype html><html><head><meta charset=\"utf-8\">" ..
        "<style>" ..
        "body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#111;margin:0;padding:0 12px;}" ..
        "h1,h2,h3,h4,h5,h6{break-after:avoid !important;page-break-after:avoid !important;-webkit-column-break-after:avoid !important;}" ..
        "p{orphans:3;widows:3;}" ..
        "</style></head><body>" .. boardHtml .. "</body></html>"
      editor.exportPdf(fullHtml, safeName .. ".pdf")
    end
  }
end
```
