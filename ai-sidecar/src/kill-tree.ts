// Giết đúng cách một tiến trình CLI đã spawn: TERM trước, đợi một khoảng ân hạn,
// KILL sau, và giết cả CÂY tiến trình (CLI như `claude` spawn thêm `node` con).
// SIGKILL rơi đúng lúc CLI đang ghi lại file credentials OAuth có thể làm hỏng
// token (file bị cụt nửa chừng) — xem ai-subscription-bridge/references/cam-bay-va-bai-hoc.md#1.
import { spawn, type ChildProcess } from "node:child_process";

const IS_WINDOWS = process.platform === "win32";

function taskkill(pid: number, force: boolean): Promise<void> {
  return new Promise((resolve) => {
    // /T bắt buộc trong CẢ HAI lần gọi: CLI như `claude` spawn thêm tiến
    // trình `node` con — proc.kill() trần (TerminateProcess của Windows)
    // chỉ giết đúng một tiến trình, để lại con mồ côi. Đã xác nhận bằng
    // test thật (spawn cmd /c ping -t, gọi proc.kill('SIGTERM') một mình
    // để lại PING.EXE sống sót) trước khi sửa thành taskkill /T ở đây.
    const args = force ? ["/F", "/T", "/PID", String(pid)] : ["/T", "/PID", String(pid)];
    const p = spawn("taskkill", args, { stdio: "ignore" });
    p.on("close", () => resolve());
    p.on("error", () => resolve());
  });
}

export async function killTree(
  proc: ChildProcess,
  graceMs = 2000,
): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const pid = proc.pid;
  if (pid == null) return;

  const exited = new Promise<void>((resolve) => {
    proc.once("exit", () => resolve());
  });

  if (IS_WINDOWS) {
    // Không có tín hiệu thật trên Windows — taskkill không /F là nỗ lực
    // "mềm" gần nhất (một số tiến trình console xử lý được sự kiện đóng),
    // vẫn phải kèm /T để không bỏ sót cây con ngay từ lần thử đầu.
    await taskkill(pid, false);
  } else {
    try {
      proc.kill("SIGTERM");
    } catch {
      // Tiến trình đã chết giữa lúc kiểm tra — bỏ qua.
    }
  }

  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), graceMs)),
  ]);

  if (!timedOut) return;

  if (IS_WINDOWS) {
    await taskkill(pid, true);
  } else {
    try {
      // start_new_session tương đương đã bật lúc spawn (xem auth.ts) để có
      // process group riêng — killpg giết cả cây.
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        proc.kill("SIGKILL");
      } catch {
        // Tiến trình đã chết.
      }
    }
  }
}
