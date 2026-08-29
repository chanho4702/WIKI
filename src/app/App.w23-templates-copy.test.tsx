import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  copyPage,
  createTemplate,
  listChildren,
  listTemplates,
  savePageAsTemplate,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 페이지 템플릿과 하위 포함 복제(W23).
 *
 * 새 문서가 언제나 빈 화면이라 회의록·기술 결정처럼 형식이 반복되는 문서를 매번 처음부터
 * 다시 짰다. 복제는 단일 페이지만 돼서, 구조를 통째로 재사용할 방법이 없었다.
 */
describe("W23 하위 포함 복제 — 스토어 계약", () => {
  it("하위까지 복제하면 계층이 보존되고 사본 표시는 뿌리에만 붙는다", async () => {
    // 시드: pg1(시작하기) ← pg3(개발 환경 설정) ← pg5(로컬 DB 설정)
    const copy = await copyPage("pg1", { includeDescendants: true });

    expect(copy.title).toBe("시작하기 (사본)");
    const children = await listChildren("sp1", copy.id);
    expect(children.map((c) => c.title)).toContain("개발 환경 설정");

    const grandchildren = await listChildren(
      "sp1",
      children.find((c) => c.title === "개발 환경 설정")!.id,
    );
    expect(grandchildren.map((c) => c.title)).toEqual(["로컬 DB 설정"]);
  });

  it("기본은 단일 페이지 복제다", async () => {
    const copy = await copyPage("pg1");

    expect(await listChildren("sp1", copy.id)).toHaveLength(0);
  });

  it("원본 계층은 그대로 남는다", async () => {
    const before = await listChildren("sp1", "pg1");

    await copyPage("pg1", { includeDescendants: true });

    expect((await listChildren("sp1", "pg1")).map((c) => c.id)).toEqual(before.map((c) => c.id));
  });
});

describe("W23 페이지 템플릿 — 스토어 계약", () => {
  it("같은 이름의 템플릿은 거부한다", async () => {
    await createTemplate("sp1", { name: "회의록", content: "## 참석자" });

    await expect(
      createTemplate("sp1", { name: "  회의록  ", content: "다른 본문" }),
    ).rejects.toThrow("이미 있습니다");
  });

  /** 앞뒤·연속 공백만 다른 이름은 고르는 화면에서 구분되지 않는다. */
  it("이름의 공백을 정규화한다", async () => {
    await createTemplate("sp1", { name: "  주간   회의록 ", content: "본문" });

    expect((await listTemplates("sp1"))[0].name).toBe("주간 회의록");
  });

  it("빈 이름은 거부한다", async () => {
    await expect(createTemplate("sp1", { name: "   ", content: "본문" })).rejects.toThrow(
      "템플릿 이름을 입력하세요",
    );
  });

  /** 제목까지 가져오면 그 템플릿으로 만든 문서마다 같은 제목이 붙는다 — 본문만 가져온다. */
  it("페이지를 템플릿으로 저장하면 본문을 가져온다", async () => {
    const template = await savePageAsTemplate("pg2");

    expect(template.name).toBe("팀 규칙");
    expect(template.content.length).toBeGreaterThan(0);
  });
});

describe("W23 화면", () => {
  it("스페이스 설정에서 템플릿을 만들면 목록에 나타난다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/settings");
    await screen.findByRole("heading", { level: 1, name: "스페이스 설정" });

    await user.click(screen.getByRole("tab", { name: "템플릿" }));
    await user.click(await screen.findByRole("button", { name: /템플릿 만들기/ }));
    await user.type(screen.getByLabelText("이름"), "회의록");
    await user.type(screen.getByLabelText("본문 (마크다운)"), "## 참석자");
    await user.click(screen.getByRole("button", { name: "저장" }));

    const list = await screen.findByRole("list", { name: "템플릿 목록" });
    expect(within(list).getByText("회의록")).toBeInTheDocument();
  });

  it("템플릿에서 만들면 그 본문으로 시작하는 초안이 생긴다", async () => {
    const user = userEvent.setup();
    await createTemplate("sp1", { name: "회의록", content: "## 참석자\n## 결정\n" });
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "새 콘텐츠" }));
    await user.click(await screen.findByRole("menuitem", { name: /템플릿에서/ }));
    const dialog = await screen.findByRole("dialog", { name: "템플릿에서 만들기" });
    await user.click(within(dialog).getByRole("button", { name: /회의록/ }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    // 편집 화면으로 이동한다 — 제목은 비어 있고 본문만 채워져 있다
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/edit");
    });
    const created = (await listChildren("sp1", null)).find((p) => p.title === "제목 없음");
    expect(created).toBeDefined();
  });

  it("템플릿이 없으면 그렇게 알린다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "새 콘텐츠" }));
    await user.click(await screen.findByRole("menuitem", { name: /템플릿에서/ }));

    const dialog = await screen.findByRole("dialog", { name: "템플릿에서 만들기" });
    expect(await within(dialog).findByText("템플릿이 없습니다")).toBeInTheDocument();
  });
});
