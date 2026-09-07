import { describe, expect, test } from "vitest";
import { QuotaManager, AiGatewayRouter } from "./index.ts";

describe("ChessNote AI Gateway & Subscription Tests", () => {
  test("QuotaManager initializes free tier user properly", () => {
    const manager = new QuotaManager();
    const user = manager.getUser("user_123");

    expect(user.userId).toBe("user_123");
    expect(user.tier).toBe("free");
    expect(user.monthlyLimit).toBe(50);
    expect(user.monthlyQueriesUsed).toBe(0);
    expect(manager.canMakeRequest("user_123")).toBe(true);
  });

  test("QuotaManager tracks usage and blocks when quota exceeded", () => {
    const manager = new QuotaManager();
    const user = manager.getUser("user_tester");
    user.monthlyQueriesUsed = 50;

    expect(manager.canMakeRequest("user_tester")).toBe(false);
    expect(manager.recordUsage("user_tester")).toBe(false);

    // Upgrade to Pro
    manager.upgradeTier("user_tester", "pro");
    expect(user.tier).toBe("pro");
    expect(user.monthlyLimit).toBe(500);
    expect(manager.canMakeRequest("user_tester")).toBe(true);
  });

  // NOTE: AiGatewayRouter.handleRequest() is currently a STUB (see
  // server/ai-gateway/router.ts) — it never calls a real LLM. This test only
  // verifies the stub's own fixed placeholder output and quota bookkeeping,
  // not real AI behavior. It is not reachable from the UI yet either (see
  // docs/plans/2026-09-07-danh-gia-va-ke-hoach-hoan-thien-chessnote.md,
  // Giai đoạn 3, for the plan to make this real).
  test("AiGatewayRouter (stub) returns the placeholder response and tracks quota", async () => {
    const manager = new QuotaManager();
    const router = new AiGatewayRouter(manager);

    const res = await router.handleRequest({
      userId: "user_pro_1",
      role: "coach",
      fen: "r1bqk2r/pppp1ppp/2n5/4p3/2B1n3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4",
      question: "Kế hoạch của Trắng nên làm gì sau khi Đen đi Nxe4?",
    });

    expect(res.success).toBe(true);
    expect(res.modelUsed).toBe("claude");
    expect(res.content).toContain("STUB — chưa kết nối AI thật");
    expect(res.remainingQuota).toBe(49);
  });
});
