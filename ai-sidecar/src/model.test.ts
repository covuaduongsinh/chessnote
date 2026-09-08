import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const { generateText } = await import("./model.ts");

/** Tiến trình con giả — đủ để generateText() chạy hết một vòng thành công. */
function fakeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  return proc;
}

/** Chạy generateText(), rồi hoàn tất tiến trình giả với 1 JSON kết quả thành công. */
async function runAndComplete(opts: Parameters<typeof generateText>[1], resultText = "ok") {
  spawnMock.mockClear();
  const proc = fakeProcess();
  spawnMock.mockReturnValueOnce(proc);
  const promise = generateText("prompt", opts);
  proc.stdout.emit("data", Buffer.from(JSON.stringify({ is_error: false, result: resultText })));
  proc.emit("close", 0);
  return { result: await promise, proc };
}

describe("generateText — cờ --model", () => {
  test("không thêm --model khi opts.model không được truyền", async () => {
    await runAndComplete({});
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain("--model");
  });

  test("thêm --model <tên> khi opts.model hợp lệ", async () => {
    await runAndComplete({ model: "claude-haiku-4-5" });
    const args = spawnMock.mock.calls[0][1] as string[];
    const idx = args.indexOf("--model");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("claude-haiku-4-5");
  });

  test("bỏ qua --model khi giá trị chứa ký tự lạ (rác/không hợp lệ)", async () => {
    await runAndComplete({ model: "haiku; rm -rf /" });
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args).not.toContain("--model");
  });

  test("kết quả trả về đúng text khi CLI thành công", async () => {
    const { result } = await runAndComplete({ model: "claude-haiku-4-5" }, "Nước này ổn.");
    expect(result).toEqual({ ok: true, text: "Nước này ổn." });
  });
});
