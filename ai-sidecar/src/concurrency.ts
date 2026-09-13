// Giới hạn số tiến trình `claude` CLI chạy đồng thời (Giai đoạn 2.2, 2026-09-13).
// Trước đây `/ai/generate` (server.ts) gọi thẳng generateText() -> spawn() một
// tiến trình CLI MỚI cho MỖI request, KHÔNG giới hạn số tiến trình song song --
// chính comment trong model.ts đã tự cảnh báo chi phí thật (~4500-8000 token
// overhead/lần) và khuyến nghị giới hạn tần suất gọi, nhưng chưa hiện thực ở
// tầng server. Nếu UI gọi AI liên tục (vd. bình luận từng nước cờ), nhiều tiến
// trình `claude` có thể chạy chồng chéo -- CPU/RAM cao, một phần nguyên nhân
// "quá tải" chung của phần mềm (không liên quan gì tới sync/Dropbox).

/** Ném ra khi hàng đợi đã đầy -- caller (server.ts) nên trả lỗi 429 ngay thay
 * vì xếp hàng vô hạn, để tránh việc UI gọi dồn dập bất thường làm hàng đợi
 * phình không kiểm soát. */
export class QueueFullError extends Error {
  constructor(maxQueueLength: number) {
    super(`Hàng đợi AI đã đầy (tối đa ${maxQueueLength} request đang chờ) -- thử lại sau.`);
  }
}

export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(
    private readonly max: number,
    private readonly maxQueueLength = Infinity,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.queue.length >= this.maxQueueLength) {
        throw new QueueFullError(this.maxQueueLength);
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  /** Chỉ dùng cho test -- số tiến trình đang thực sự chạy tại thời điểm gọi. */
  activeCountForTests(): number {
    return this.active;
  }
}
