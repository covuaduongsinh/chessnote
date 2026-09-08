// Sinh văn bản thuần bằng chính CLI `claude` (không dùng @anthropic-ai/claude-agent-sdk —
// license độc quyền, không MIT; quyết định chốt với người dùng ngày 2026-09-08).
// Prompt được bơm qua STDIN (không phải argv) để tránh trần dòng lệnh 32767 ký tự
// của Windows hoàn toàn (xem cam-bay-va-bai-hoc.md#5) — đã xác nhận `claude -p`
// (không kèm prompt ở argv) tự đọc prompt từ stdin trên máy dev thật.
//
// Khoá tool CHẶT: `--restricted` (bỏ Bash/PowerShell/REPL/WebFetch) + `--disallowedTools`
// liệt kê nốt các tool còn lại (Read/Write/Edit/Glob/Grep/WebSearch/Task/NotebookEdit) +
// `--permission-prompts none` (mọi thứ cần hỏi quyền đều tự động bị từ chối thay vì treo
// chờ). Đây là nhánh CHỈ sinh văn bản — không cho phép agent đụng file/mạng/lệnh — đúng
// cảnh báo của skill: request mang tool từng bị một số tài khoản subscription trả lỗi
// "out of extra usage".
//
// Đã xác nhận thật trên máy dev (2026-09-08, tài khoản Claude Max thật):
//   - `--restricted --disallowedTools "..." --permission-prompts none --output-format json`
//     trả JSON có field `result` (chuỗi), `is_error`, `permission_denials: []` (không tool
//     nào bị chặn vì không tool nào được gọi).
//   - Prompt qua stdin (không đưa ở argv) hoạt động, tránh hẳn giới hạn argv Windows.
//   - `--bare` KHÔNG dùng được ở chế độ subscription (CLI báo "Not logged in" — có vẻ bỏ
//     qua luôn phần đọc trạng thái đăng nhập cùng lúc bỏ settings) — không dùng cờ này.
//   - CHI PHÍ THẬT ĐÁNG LƯU Ý: mỗi lệnh gọi là một tiến trình `claude` MỚI → một session
//     mới → KHÔNG tái dùng cache giữa các lần gọi. Overhead hệ thống (system prompt + định
//     nghĩa tool của CLI) tốn ~4500-8000 token "cache_creation" MỖI LẦN gọi dù prompt chỉ
//     một câu, quy đổi theo giá API là ~$0.01-0.09/lần (trừ vào ngân sách gói Claude Max,
//     không phải tính tiền thật vì đang ở chế độ subscription — nhưng vẫn là ngân sách hữu
//     hạn hàng tháng). Nếu tính năng gọi liên tục (vd. bình luận từng nước trong ván dài),
//     cần cân nhắc giới hạn tần suất gọi hoặc gộp nhiều nước vào một lần hỏi, KHÔNG gọi một
//     lần cho mỗi nước riêng lẻ.
import { spawn } from "node:child_process";
import { killTree } from "./kill-tree.js";
import { collectUtf8 } from "./utf8-stream.js";
import { envForCli } from "./mode.js";

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const LOCKED_DOWN_TOOLS = "Read Write Edit Glob Grep WebSearch Task NotebookEdit Bash";

export type GenerateResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export async function generateText(
  prompt: string,
  opts: { mode?: unknown; timeoutMs?: number } = {},
): Promise<GenerateResult> {
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const args = [
    "-p",
    "--restricted",
    "--disallowedTools",
    LOCKED_DOWN_TOOLS,
    "--permission-prompts",
    "none",
    "--output-format",
    "json",
  ];

  return new Promise((resolve) => {
    let done = false;
    const finish = (result: GenerateResult) => {
      if (done) return;
      done = true;
      resolve(result);
    };

    let proc;
    try {
      proc = spawn(CLAUDE_BIN, args, {
        stdio: ["pipe", "pipe", "pipe"],
        // Chạy ngoài thư mục repo: tránh nạp CLAUDE.md/ngữ cảnh dự án vào mỗi
        // lần gọi (tốn thêm token, và không liên quan tới việc bình luận cờ).
        cwd: process.env.TEMP || process.env.TMP || "/tmp",
        env: { ...process.env, ...envForCli(opts.mode) },
      });
    } catch (e) {
      finish({ ok: false, error: `không chạy được CLI claude: ${(e as Error).message}` });
      return;
    }

    const stdout = collectUtf8(proc.stdout!);
    collectUtf8(proc.stderr!); // đọc hộ để không nghẽn pipe, không cần nội dung

    proc.on("error", (e) => finish({ ok: false, error: e.message }));
    proc.on("close", (code) => {
      if (done) return;
      if (code !== 0) {
        finish({ ok: false, error: `CLI thoát với mã ${code}: ${stdout.text().slice(0, 500)}` });
        return;
      }
      try {
        const j = JSON.parse(stdout.text());
        if (j.is_error) {
          finish({ ok: false, error: String(j.result || "lỗi không rõ từ CLI") });
        } else {
          finish({ ok: true, text: String(j.result ?? "") });
        }
      } catch {
        finish({ ok: false, error: "không parse được JSON từ CLI" });
      }
    });

    const t = setTimeout(async () => {
      await killTree(proc, 1000);
      finish({ ok: false, error: "hết thời gian chờ CLI phản hồi" });
    }, timeoutMs);
    t.unref?.();

    // Ghi dạng BYTE (không phải chuỗi text) để tránh Windows tự dịch \n
    // thành \r\n khi ghi qua pipe văn bản — xem cam-bay-va-bai-hoc.md#4.
    proc.stdin!.write(Buffer.from(prompt, "utf8"));
    proc.stdin!.end();
  });
}
