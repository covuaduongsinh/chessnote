import { describe, expect, test } from "vitest";
import { QuotaManager } from "./quota_manager.ts";
import { AiGatewayRouter } from "./router.ts";

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

  test("AiGatewayRouter routes coach requests and returns GM analysis", async () => {
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
    expect(res.content).toContain("Phân tích bởi Grandmaster AI");
    expect(res.remainingQuota).toBe(49);
  });
});
