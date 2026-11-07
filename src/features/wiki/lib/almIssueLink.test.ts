import { describe, expect, it } from "vitest";
import { almIssueHref, almIssueLink, collectAlmIssueKeys, normalizeAlmIssueKey } from "./almIssueLink";

/** ALM 이슈 링크 인식(W3, 설계 2026-11-08 §4.4) — 스마트 링크로 올릴지 정하는 단일 규칙. */
describe("almIssueLink", () => {
  it.each([
    ["/alm/browse/PLAT-12", "PLAT-12"],
    ["/alm/browse/PLAT-12/", "PLAT-12"],
    ["http://wiki.local/alm/browse/PLAT-12", "PLAT-12"],
    ["https://other-host.example/alm/browse/PLAT-12#c", "PLAT-12"],
    ["/alm/projects/3/issues?issue=PLAT-12", "PLAT-12"],
    ["http://localhost:8080/alm/projects/3/issues?view=list&issue=PLAT-12", "PLAT-12"],
    ["/alm/projects/3/issues/?issue=PLAT-12", "PLAT-12"],
  ])("%s → %s", (href, key) => {
    expect(almIssueLink(href)).toEqual({ key });
  });

  it("소문자 키·공백을 대문자로 정규화한다", () => {
    expect(almIssueLink("/alm/browse/plat-12")).toEqual({ key: "PLAT-12" });
    expect(almIssueLink("/alm/projects/3/issues?issue=wiki_ops-7")).toEqual({ key: "WIKI_OPS-7" });
    expect(almIssueLink("/alm/browse/%20plat-3")).toEqual({ key: "PLAT-3" });
  });

  it.each([
    ["ALM이 아닌 경로", "/wiki/spaces/1/pages/2"],
    ["키 형식이 아님(번호 없음)", "/alm/browse/PLAT"],
    ["키 형식이 아님(숫자로 시작)", "/alm/browse/1PLAT-2"],
    ["프로젝트 키가 너무 김", "/alm/browse/ABCDEFGHIJKLM-1"],
    ["번호가 10자리", "/alm/browse/PLAT-1234567890"],
    ["browse 아래 더 깊은 경로", "/alm/browse/PLAT-12/edit"],
    ["issue 파라미터 없음", "/alm/projects/3/issues"],
    ["다른 화면의 issue 파라미터", "/alm/projects/3/board?issue=PLAT-12"],
    ["숫자가 아닌 프로젝트 id", "/alm/projects/abc/issues?issue=PLAT-12"],
    ["/alm이 경로 맨 앞이 아님", "/docs/alm/browse/PLAT-12"],
    ["http(s)가 아닌 스킴", "javascript:/alm/browse/PLAT-12"],
    ["멘션 스킴", "user:7"],
    ["빈 값", ""],
  ])("%s는 인식하지 않는다", (_name, href) => {
    expect(almIssueLink(href)).toBeNull();
  });

  it("almIssueHref는 같은 오리진 상대 경로의 정규 주소다", () => {
    expect(almIssueHref("PLAT-12")).toBe("/alm/browse/PLAT-12");
    expect(almIssueLink(almIssueHref("PLAT-12"))).toEqual({ key: "PLAT-12" });
  });

  it("normalizeAlmIssueKey — 형식이 아니면 null", () => {
    expect(normalizeAlmIssueKey(" plat-12 ")).toBe("PLAT-12");
    expect(normalizeAlmIssueKey("PLAT 12")).toBeNull();
    expect(normalizeAlmIssueKey(null)).toBeNull();
  });
});

describe("collectAlmIssueKeys", () => {
  it("본문의 링크·자동 링크·맨 URL에서 키를 중복 없이 등장 순으로 모은다", () => {
    const md = [
      "스펙: [PLAT-12](/alm/browse/PLAT-12) 참고",
      "모달 주소 <http://host/alm/projects/3/issues?issue=wiki-7>",
      "맨 주소 https://host/alm/browse/ALM-1 와 [다시](/alm/browse/plat-12)",
    ].join("\n");

    expect(collectAlmIssueKeys(md)).toEqual(["PLAT-12", "WIKI-7", "ALM-1"]);
  });

  it("ALM 링크가 없으면 빈 목록 — 키처럼 보이는 글자만으로는 모으지 않는다", () => {
    expect(collectAlmIssueKeys("PLAT-12는 아직 링크가 아니다. [위키](/wiki/spaces/1)")).toEqual([]);
  });
});
