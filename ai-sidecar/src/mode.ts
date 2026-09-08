// Công tắc subscription/api_key. Sidecar là nguồn sự thật duy nhất cho việc
// có API key hay không — ChessNote (Space Config) chỉ gửi Ý ĐỊNH chế độ, không
// bao giờ gửi/đọc giá trị key thật. Giá trị lạ hoặc key rỗng đều lùi về
// "subscription", không được để biến rỗng làm chết mọi lượt gọi.
export type AiMode = "subscription" | "api_key";

export function normalizeMode(requested: unknown): AiMode {
  return requested === "api_key" ? "api_key" : "subscription";
}

export function envForCli(requestedMode: unknown): Record<string, string> {
  const mode = normalizeMode(requestedMode);
  if (mode !== "api_key") return {};
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  return key ? { ANTHROPIC_API_KEY: key } : {};
}
