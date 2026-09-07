import { CHESS_PROMPTS } from "./prompts.ts";
import { QuotaManager, type SubscriptionTier } from "./quota_manager.ts";

export type AiAgentModel = "claude" | "antigravity" | "openai" | "grok";
export type AiAgentRole = "coach" | "annotator" | "repertoire";

export interface AgentRequest {
  userId: string;
  role: AiAgentRole;
  modelPreference?: AiAgentModel;
  fen?: string;
  pgn?: string;
  question: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export interface AgentResponse {
  success: boolean;
  content: string;
  modelUsed: AiAgentModel;
  remainingQuota: number;
  tier: SubscriptionTier;
  error?: string;
}

export class AiGatewayRouter {
  constructor(private quotaManager: QuotaManager) {}

  /**
   * STUB — does not call any real LLM yet. `promptText` below is built but
   * never sent anywhere; this always returns the same hardcoded sample
   * response regardless of input. Not wired into the UI (plugs/chess/) or
   * into the Rust server (no route in server/src/router.rs) — currently
   * unreachable dead code. See
   * docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md,
   * Giai đoạn 3, for the real subscription-bridge implementation plan.
   */
  async handleRequest(req: AgentRequest): Promise<AgentResponse> {
    const user = this.quotaManager.getUser(req.userId);

    if (!this.quotaManager.canMakeRequest(req.userId)) {
      return {
        success: false,
        content: "",
        modelUsed: "claude",
        remainingQuota: 0,
        tier: user.tier,
        error: "Bạn đã dùng hết hạn mức câu hỏi của tháng này. Vui lòng nâng cấp gói Pro hoặc Master để tiếp tục sử dụng!",
      };
    }

    // Determine model to use
    let model: AiAgentModel = req.modelPreference || "claude";
    if (req.role === "coach") {
      model = req.modelPreference || "claude"; // Claude excels at GM coach explanations
    } else if (req.role === "annotator") {
      model = req.modelPreference || "antigravity"; // Antigravity/Gemini excels at large context & full PGN analysis
    }

    // Record usage
    this.quotaManager.recordUsage(req.userId);

    // Build context prompt
    const systemPrompt = req.role === "coach"
      ? CHESS_PROMPTS.COACH
      : req.role === "annotator"
      ? CHESS_PROMPTS.ANNOTATOR
      : CHESS_PROMPTS.REPERTOIRE_STRATEGIST;

    const contextParts: string[] = [];
    if (req.fen) contextParts.push(`[Thế cờ FEN hiện tại]: ${req.fen}`);
    if (req.pgn) contextParts.push(`[Biên bản ván đấu PGN]:\n${req.pgn}`);
    contextParts.push(`[Câu hỏi của người học]: ${req.question}`);

    const promptText = `${systemPrompt}\n\n${contextParts.join("\n\n")}`;

    // STUB response — not a real LLM call, see class doc comment above.
    return {
      success: true,
      content: `[⚠️ STUB — chưa kết nối AI thật (${model.toUpperCase()})]\n\n` +
        `Thế cờ FEN: ${req.fen || "N/A"}\n\n` +
        `Đây là phản hồi mẫu cố định để phát triển giao diện, không phải phân tích thật. ` +
        `Xem docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md (Giai đoạn 3).`,
      modelUsed: model,
      remainingQuota: user.monthlyLimit - user.monthlyQueriesUsed,
      tier: user.tier,
    };
  }
}
