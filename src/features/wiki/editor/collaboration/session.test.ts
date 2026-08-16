import { describe, expect, it } from "vitest";
import {
  collaborationWebsocketUrl,
  createTicketTokenProvider,
  participantColor,
  participantsFromAwareness,
} from "./session";

describe("collaboration session helpers", () => {
  it("same-origin HTTP(S) API 경로를 WebSocket URL로 변환하고 ticket을 query에 싣지 않는다", () => {
    expect(collaborationWebsocketUrl(
      "/api/wiki/collaboration",
      "https://wiki.example.com",
      "https://wiki.example.com",
    )).toBe("wss://wiki.example.com/api/wiki/collaboration");
    expect(collaborationWebsocketUrl(
      "/api/wiki/collaboration",
      "",
      "http://localhost:5174",
    )).toBe("ws://localhost:5174/api/wiki/collaboration");
  });

  it("확정되지 않은 WebSocket 경로는 거부한다", () => {
    expect(() => collaborationWebsocketUrl(
      "https://evil.example/socket",
      "",
      "https://wiki.example.com",
    )).toThrow("공동 편집 연결 경로를 확인할 수 없습니다");
  });

  it("awareness에서 유효한 사용자만 추출하고 같은 사용자의 여러 탭을 합친다", () => {
    expect(participantsFromAwareness([
      { clientId: 1, user: { id: "7", name: "김찬호", color: "#0c66e4" } },
      { clientId: 2, user: { id: "7", name: "김찬호", color: "#0c66e4" } },
      { clientId: 3, user: { id: "8", name: "Alice", color: "#5e4db2" } },
      { clientId: 4, user: { id: 9 } },
      { clientId: 5, user: { id: "9", name: "Mallory", color: "url(https://evil.example)" } },
    ])).toEqual([
      { clientId: 1, id: "7", name: "김찬호", color: "#0c66e4" },
      { clientId: 3, id: "8", name: "Alice", color: "#5e4db2" },
    ]);
  });

  it("재연결 인증에는 이미 소비된 값을 재사용하지 않고 새 ticket을 발급한다", async () => {
    const initial = {
      ticket: "first-ticket",
      room: "page:7",
      websocketPath: "/api/wiki/collaboration",
      expiresAt: "2026-08-16T10:00:00Z",
    };
    let issues = 0;
    const token = createTicketTokenProvider(initial, "7", async () => {
      issues += 1;
      return { ...initial, ticket: `fresh-ticket-${issues}` };
    });

    await expect(token()).resolves.toBe("first-ticket");
    await expect(token()).resolves.toBe("fresh-ticket-1");
    await expect(token()).resolves.toBe("fresh-ticket-2");
    expect(issues).toBe(2);
  });

  it("같은 사용자 id는 항상 같은 팔레트 색을 얻는다", () => {
    expect(participantColor("user-42")).toBe(participantColor("user-42"));
    expect(participantColor("user-42")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
