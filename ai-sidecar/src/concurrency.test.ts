import { describe, expect, test } from "vitest";
import { QueueFullError, Semaphore } from "./concurrency.ts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("Semaphore", () => {
  test("never runs more than `max` tasks concurrently", async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxObserved = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());

    const runs = gates.map((gate, i) =>
      sem.run(async () => {
        active++;
        maxObserved = Math.max(maxObserved, active);
        await gate.promise;
        active--;
        return i;
      }),
    );

    // Cho vòng lặp microtask chạy để 2 task đầu thực sự bắt đầu.
    await Promise.resolve();
    await Promise.resolve();
    expect(sem.activeCountForTests()).toBe(2); // tối đa 2 task đang chạy, 3 task còn lại xếp hàng

    gates[0].resolve();
    gates[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    gates[2].resolve();
    gates[3].resolve();
    gates[4].resolve();

    const results = await Promise.all(runs);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(maxObserved).toBeLessThanOrEqual(2);
    expect(sem.activeCountForTests()).toBe(0);
  });

  test("a task that throws still releases its slot for the next queued task", async () => {
    const sem = new Semaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // Nếu slot không được giải phóng, task thứ 2 sẽ treo vô thời hạn.
    const result = await sem.run(async () => "ok");
    expect(result).toBe("ok");
  });

  test("rejects with QueueFullError once the queue exceeds maxQueueLength, instead of queueing forever", async () => {
    const sem = new Semaphore(1, 2); // 1 chạy đồng thời, tối đa 2 chờ trong hàng đợi
    const gate = deferred<void>();
    const blocking = sem.run(() => gate.promise); // chiếm slot đang chạy
    const queued1 = sem.run(async () => "a"); // vào hàng đợi (1/2)
    const queued2 = sem.run(async () => "b"); // vào hàng đợi (2/2)

    await expect(sem.run(async () => "c")).rejects.toBeInstanceOf(QueueFullError);

    gate.resolve();
    await blocking;
    expect(await queued1).toBe("a");
    expect(await queued2).toBe("b");
  });
});
