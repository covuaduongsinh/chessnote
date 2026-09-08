// Giải mã UTF-8 TĂNG DẦN cho output của subprocess. Ghép từng chunk Buffer
// bằng .toString('utf8') độc lập có thể cắt đôi một ký tự nhiều byte đúng
// ranh giới chunk (chữ tiếng Việt trong prompt/output CLI biến thành "<?>").
// TextDecoder({stream:true}) giữ lại phần byte lẻ cuối chunk cho lần gọi sau,
// nên không bao giờ cắt giữa ký tự. Xem
// ai-subscription-bridge/references/cam-bay-va-bai-hoc.md#4.
export function collectUtf8(stream: NodeJS.ReadableStream): {
  text: () => string;
  onData: (fn: (piece: string) => void) => void;
} {
  const decoder = new TextDecoder("utf-8");
  let full = "";
  const listeners: Array<(piece: string) => void> = [];

  stream.on("data", (b: Buffer) => {
    const piece = decoder.decode(b, { stream: true });
    full += piece;
    for (const fn of listeners) fn(piece);
  });
  stream.on("end", () => {
    const tail = decoder.decode();
    if (tail) {
      full += tail;
      for (const fn of listeners) fn(tail);
    }
  });

  return {
    text: () => full,
    onData: (fn) => listeners.push(fn),
  };
}
