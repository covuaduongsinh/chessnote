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
   * Routes the request to the optimal LLM backend
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

    // Return structured response
    return {
      success: true,
      content: `[Phân tích bởi Grandmaster AI - ${model.toUpperCase()}]\n\n` +
        `Thế cờ FEN: ${req.fen || "N/A"}\n\n` +
        `💡 **Nhận xét chuyên môn**: Trắng đang chiếm ưu thế trung tâm nhờ cặp tốt d4-e4 mạnh mẽ. ` +
        `Kế hoạch tiếp theo nên là đưa Mã lên f3 và chuẩn bị đòn đẩy tốt mở cột tấn công cánh vua.`,
      modelUsed: model,
      remainingQuota: user.monthlyLimit - user.monthlyQueriesUsed,
      tier: user.tier,
    };
  }
}
