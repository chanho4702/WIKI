import { describe, expect, it } from "vitest";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { USER_MENTION_NAME, mentionUserIdFromHref, sanitizeMentionName } from "./extensions/userMention";
import { filterMentionCandidates } from "./extensions/userMentionSuggestion";

const normalize = (s: string) => s.replace(/\r\n/g, "\n").trim();
const roundtrip = (md: string) => normalize(serializeMarkdown(parseMarkdown(md)));

/** 멘션 저장 문법 `[@이름](user:id)` 계약 — 문법 근거는 extensions/userMention.ts. */
describe("사용자 멘션 — 마크다운 왕복", () => {
  it("표준 링크 표기가 그대로 보존된다", () => {
    const md = "담당: [@김찬호](user:1) 확인 부탁";
    expect(roundtrip(md)).toBe(md);
  });

  it("파싱 결과가 userMention 원자 노드다(링크로 새지 않는다)", () => {
    const doc = parseMarkdown("[@김찬호](user:1)");
    const json = JSON.stringify(doc);
    expect(json).toContain(`"${USER_MENTION_NAME}"`);
    expect(json).toContain('"userId":"1"');
    expect(json).toContain('"name":"김찬호"');
  });

  it("user: 스킴이 아닌 링크는 멘션으로 오인하지 않는다", () => {
    const md = "[@핸들](https://example.com/@핸들)";
    const doc = parseMarkdown(md);
    expect(JSON.stringify(doc)).not.toContain(USER_MENTION_NAME);
  });

  it("숫자가 아닌 user: href는 승격하지 않는다", () => {
    expect(mentionUserIdFromHref("user:abc")).toBeNull();
    expect(mentionUserIdFromHref("user:1")).toBe("1");
  });
});

describe("멘션 자동완성 후보", () => {
  const users = [
    { id: "1", name: "김찬호" },
    { id: "2", name: "이서연" },
    { id: "3", name: "괄호[금지]" },
  ];

  it("이름 부분일치로 거르고 문법 충돌 이름은 제외한다", () => {
    expect(filterMentionCandidates(users, "서")).toEqual([{ id: "2", name: "이서연" }]);
    expect(filterMentionCandidates(users, "").map((u) => u.id)).toEqual(["1", "2"]);
  });

  it("sanitizeMentionName은 대괄호·개행을 걷어낸다", () => {
    expect(sanitizeMentionName("괄[호]\n이름")).toBe("괄호 이름");
  });
});
