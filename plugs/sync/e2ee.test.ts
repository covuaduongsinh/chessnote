import { describe, expect, test, vi } from "vitest";
import {
  EncryptingSyncProvider,
  createLocalCheckValue,
  decryptBuffer,
  encryptBuffer,
  verifyLocalCheckValue,
} from "./e2ee.ts";
import type { RemoteFileEntry, SyncProvider, WriteMode } from "./sync_provider.ts";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("encryptBuffer / decryptBuffer", () => {
  test("round-trips plaintext through the same key", async () => {
    const { key } = await createLocalCheckValue("correct horse battery staple");
    const packed = await encryptBuffer(key, enc("xin chào ChessNote"));
    const plain = await decryptBuffer(key, packed);
    expect(dec(plain)).toBe("xin chào ChessNote");
  });

  test("two encryptions of the same plaintext produce different ciphertexts (fresh IV each time)", async () => {
    const { key } = await createLocalCheckValue("pw");
    const a = await encryptBuffer(key, enc("same content"));
    const b = await encryptBuffer(key, enc("same content"));
    expect(a).not.toEqual(b);
  });

  test("decrypting with the wrong password's key throws a clear error, not garbage bytes", async () => {
    const { key: rightKey } = await createLocalCheckValue("right-password");
    const { key: wrongKey } = await createLocalCheckValue("wrong-password");
    const packed = await encryptBuffer(rightKey, enc("secret"));
    await expect(decryptBuffer(wrongKey, packed)).rejects.toThrow(/Không giải mã được/);
  });

  test("two different passwords derive two different keys (fixed salt does not collapse them)", async () => {
    const { key: keyA } = await createLocalCheckValue("password-a");
    const { key: keyB } = await createLocalCheckValue("password-b");
    const packed = await encryptBuffer(keyA, enc("data"));
    await expect(decryptBuffer(keyB, packed)).rejects.toThrow();
  });

  test("the same password derives the SAME key every time (fixed salt) -- required for cross-device decrypt", async () => {
    const { key: key1 } = await createLocalCheckValue("same-password");
    const { key: key2 } = await createLocalCheckValue("same-password");
    const packed = await encryptBuffer(key1, enc("data encrypted on device A"));
    const plain = await decryptBuffer(key2, packed);
    expect(dec(plain)).toBe("data encrypted on device A");
  });
});

describe("createLocalCheckValue / verifyLocalCheckValue", () => {
  test("verifying with the correct password succeeds and returns a usable key", async () => {
    const { checkValue } = await createLocalCheckValue("my-password");
    const key = await verifyLocalCheckValue("my-password", checkValue);
    const packed = await encryptBuffer(key, enc("ok"));
    expect(dec(await decryptBuffer(key, packed))).toBe("ok");
  });

  test("verifying with the wrong password throws 'Mật khẩu không đúng.'", async () => {
    const { checkValue } = await createLocalCheckValue("my-password");
    await expect(verifyLocalCheckValue("not-my-password", checkValue)).rejects.toThrow(
      "Mật khẩu không đúng.",
    );
  });
});

describe("EncryptingSyncProvider", () => {
  class FakeProvider implements SyncProvider {
    readonly name = "Fake";
    stored = new Map<string, Uint8Array>();
    uploadedRaw: Uint8Array[] = [];

    async listEntries(): Promise<RemoteFileEntry[]> {
      return [...this.stored.keys()].map((path) => ({
        path,
        rev: "r",
        serverModified: "s",
        deleted: false,
      }));
    }
    async download(_folder: string, path: string) {
      return { data: this.stored.get(path)!, rev: "r", serverModified: "s" };
    }
    async upload(_folder: string, path: string, data: Uint8Array, _mode: WriteMode) {
      this.uploadedRaw.push(data);
      this.stored.set(path, data);
      return { rev: "r", serverModified: "s" };
    }
    async delete(_folder: string, path: string) {
      this.stored.delete(path);
    }
  }

  test("keeps the provider's name unchanged (so the per-provider state file path is unaffected)", async () => {
    const { key } = await createLocalCheckValue("pw");
    const wrapped = new EncryptingSyncProvider(new FakeProvider(), key);
    expect(wrapped.name).toBe("Fake");
  });

  test("upload encrypts, download decrypts -- performSync only ever sees plaintext", async () => {
    const { key } = await createLocalCheckValue("pw");
    const inner = new FakeProvider();
    const wrapped = new EncryptingSyncProvider(inner, key);

    await wrapped.upload("folder", "a.md", enc("plaintext content"), { tag: "add" });
    // Nội dung THẬT trên "remote" (inner) phải là ciphertext, không phải plaintext.
    expect(inner.uploadedRaw[0]).not.toEqual(enc("plaintext content"));

    const result = await wrapped.download("folder", "a.md");
    expect(dec(result.data)).toBe("plaintext content");
  });

  test("listEntries and delete pass through unchanged (no encryption of metadata/paths)", async () => {
    const { key } = await createLocalCheckValue("pw");
    const inner = new FakeProvider();
    const listEntriesSpy = vi.spyOn(inner, "listEntries");
    const deleteSpy = vi.spyOn(inner, "delete");
    const wrapped = new EncryptingSyncProvider(inner, key);

    await wrapped.listEntries("folder");
    await wrapped.delete("folder", "a.md");

    expect(listEntriesSpy).toHaveBeenCalledWith("folder");
    expect(deleteSpy).toHaveBeenCalledWith("folder", "a.md");
  });
});
