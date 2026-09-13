// Test riêng cho việc cache WebAssembly.Module đã compile (Giai đoạn 3.1,
// 2026-09-13) -- trước đây MỖI evalPosition() gọi
// `WebAssembly.instantiate(wasmBytes, imports)` (overload BYTES, compile lại
// từ đầu mỗi lần) dù bytes bản thân đã được cache; giờ chỉ compile 1 lần
// (`WebAssembly.compile`) rồi dùng overload `instantiate(module, imports)`
// (chỉ link) cho mọi lần sau. Không dùng WASM/Emscripten thật (engine.test.ts
// đã giải thích lý do: cần `space.readFile` + module glue thật, không có
// trong môi trường unit test) -- mock cả syscalls lẫn `./wasm/arasan.mjs`,
// chỉ kiểm tra ĐÚNG các overload WebAssembly nào được gọi bao nhiêu lần.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const fileExistsMock = vi.fn(async () => true);
const readFileMock = vi.fn(async (path: string) =>
  path.endsWith(".nnue") ? new Uint8Array([1, 2, 3]) : new Uint8Array([0, 97, 115, 109]),
);
vi.mock("@silverbulletmd/silverbullet/syscalls", () => ({
  space: { fileExists: fileExistsMock, readFile: readFileMock },
}));

/** Mô phỏng đúng luồng Emscripten thật gọi `instantiateWasm` rồi
 * `successCallback(instance, module)` -- đủ để bài test quan sát chính xác
 * arg nào được truyền cho `WebAssembly.instantiate`, không cần glue code thật. */
const arasanModuleMock = vi.fn(async (opts: any) => {
  const instance = { FS: { writeFile: vi.fn() }, callMain: vi.fn(() => opts.print("bestmove e2e4")) };
  await new Promise<void>((resolve) => {
    opts.instantiateWasm({}, (_inst: unknown, _mod: unknown) => resolve());
  });
  return instance;
});
vi.mock("./wasm/arasan.mjs", () => ({ default: (opts: unknown) => arasanModuleMock(opts) }));

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const OTHER_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

async function freshModule() {
  vi.resetModules();
  return await import("./arasan_engine.ts");
}

let fakeModule: object;
let fakeInstance: object;
let compileSpy: ReturnType<typeof vi.spyOn>;
let instantiateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fileExistsMock.mockClear();
  readFileMock.mockClear();
  arasanModuleMock.mockClear();
  fakeModule = { marker: "compiled-module" };
  fakeInstance = { marker: "instance" };
  compileSpy = vi.spyOn(WebAssembly, "compile").mockResolvedValue(fakeModule as WebAssembly.Module);
  instantiateSpy = vi
    .spyOn(WebAssembly, "instantiate")
    .mockImplementation(async () => fakeInstance as WebAssembly.Instance);
});

afterEach(() => {
  compileSpy.mockRestore();
  instantiateSpy.mockRestore();
});

describe("evalPosition WebAssembly.Module caching", () => {
  test("compiles the module only once across multiple evalPosition() calls", async () => {
    const { evalPosition } = await freshModule();

    await evalPosition(START_FEN, 1);
    await evalPosition(OTHER_FEN, 1);

    expect(compileSpy).toHaveBeenCalledTimes(1); // KHÔNG compile lại lần 2
    expect(instantiateSpy).toHaveBeenCalledTimes(2); // nhưng vẫn instantiate (link) mỗi lần
  });

  test("every instantiate() call reuses the SAME compiled module instance, not a fresh one", async () => {
    const { evalPosition } = await freshModule();

    await evalPosition(START_FEN, 1);
    await evalPosition(OTHER_FEN, 1);

    const modulesPassed = instantiateSpy.mock.calls.map((call: unknown[]) => call[0]);
    expect(modulesPassed[0]).toBe(fakeModule); // overload (module, imports) -- 1st arg LÀ module đã compile
    expect(modulesPassed[1]).toBe(fakeModule);
    expect(modulesPassed[0]).toBe(modulesPassed[1]); // cùng 1 reference, không phải 2 module khác nhau
  });

  test("still reads the wasm/nnue bytes from space only once (byte cache untouched by this change)", async () => {
    const { evalPosition } = await freshModule();

    await evalPosition(START_FEN, 1);
    await evalPosition(OTHER_FEN, 1);

    expect(readFileMock).toHaveBeenCalledTimes(2); // 1x wasm + 1x nnue, không lặp lại ở lần 2
  });
});
