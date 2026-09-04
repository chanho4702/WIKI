import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  createTemplate,
  getPage,
  listChildren,
  listTemplates,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import { todayIso } from "../features/wiki/lib/templateVariables";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/** 방금 만들어진 초안의 본문 — 제목은 언제나 "제목 없음"이라 그것으로 찾는다. */
async function draftBody(): Promise<string> {
  const created = (await listChildren("sp1", null)).find((p) => p.title === "제목 없음");
  expect(created).toBeDefined();
  const page = await getPage(created!.id);
  expect(page).not.toBeNull();
  return page!.body;
}

async function openTemplatePicker(user: ReturnType<typeof userEvent.setup>) {
  renderApp("/spaces/sp1");
  await screen.findByRole("navigation", { name: "페이지 트리" });
  await user.click(screen.getByRole("button", { name: "새 콘텐츠" }));
  await user.click(await screen.findByRole("menuitem", { name: /템플릿에서/ }));
  return screen.findByRole("dialog", { name: "템플릿에서 만들기" });
}

/**
 * 기본 템플릿 갤러리와 템플릿 변수(W27-1).
 *
 * 전에는 새 스페이스에서 "템플릿에서 만들기"를 열면 언제나 빈 목록이었다 — 회의록·결정 기록처럼
 * 형식이 정해진 문서를 매번 처음부터 짜야 했다. 기본 템플릿은 코드에 있어 조회가 없고,
 * 고치고 싶으면 설정에서 이 스페이스로 복사한다.
 */
describe("W27 기본 템플릿에서 만들기", () => {
  it("스페이스 템플릿이 없어도 기본 템플릿 10종이 보인다", async () => {
    const user = userEvent.setup();
    const dialog = await openTemplatePicker(user);

    const builtins = within(dialog).getByRole("list", { name: "기본 템플릿" });
    expect(within(builtins).getAllByRole("button")).toHaveLength(10);
    // 스페이스 템플릿 묶음은 그대로 빈 문구를 보여준다
    expect(await within(dialog).findByText("템플릿이 없습니다")).toBeInTheDocument();
  });

  it("기본 템플릿으로 만들면 본문이 채워지고 날짜·작성자·스페이스가 치환된다", async () => {
    const user = userEvent.setup();
    const dialog = await openTemplatePicker(user);

    const builtins = within(dialog).getByRole("list", { name: "기본 템플릿" });
    await user.click(within(builtins).getByRole("button", { name: /회의록/ }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/edit");
    });

    const body = await draftBody();
    expect(body).toContain("## 안건");
    expect(body).toContain("## 결정 사항");
    expect(body).toContain(todayIso());
    expect(body).toContain("김찬호"); // 목업 현재 사용자
    expect(body).toContain("개발 위키"); // 시드 스페이스 이름
    expect(body).not.toContain("{{");
  });

  /** 저장된 본문만이 아니라 편집기에 실제로 실린 내용을 본다(jsdom에서는 레지스트리 경유). */
  it("만든 문서가 편집 화면 본문으로 열린다", async () => {
    const user = userEvent.setup();
    const dialog = await openTemplatePicker(user);

    const builtins = within(dialog).getByRole("list", { name: "기본 템플릿" });
    await user.click(within(builtins).getByRole("button", { name: /주간 상태 보고/ }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    await waitFor(() => {
      const markdown = editorRegistry.current?.storage.markdown.getMarkdown() ?? "";
      expect(markdown).toContain("이번 주 한 일");
      expect(markdown).toContain("다음 주 할 일");
      expect(markdown).toContain(todayIso());
    });
  });

  /** 규칙은 하나다 — 스페이스 템플릿도 같은 변수를 같은 시점에 치환한다. */
  it("스페이스 템플릿에도 같은 변수 규칙이 적용된다", async () => {
    const user = userEvent.setup();
    await createTemplate("sp1", {
      name: "간단 보고",
      content: "작성자: {{author}} / 날짜: {{date}} / 스페이스: {{space}} / 그대로: {{title}}",
    });
    const dialog = await openTemplatePicker(user);

    const spaceList = await within(dialog).findByRole("list", { name: "스페이스 템플릿" });
    await user.click(within(spaceList).getByRole("button", { name: /간단 보고/ }));
    await user.click(within(dialog).getByRole("button", { name: "만들기" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/edit");
    });

    const body = await draftBody();
    expect(body).toContain(`작성자: 김찬호 / 날짜: ${todayIso()} / 스페이스: 개발 위키`);
    // 모르는 변수는 지우지 않는다 — 오타를 조용히 삼키면 작성자가 알아챌 방법이 없다
    expect(body).toContain("{{title}}");
  });
});

describe("W27 기본 템플릿 복사", () => {
  it("설정에서 복사하면 스페이스 템플릿 목록에 생긴다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/settings/templates");
    await screen.findByRole("heading", { level: 1, name: "템플릿" });

    await user.click(
      await screen.findByRole("button", { name: /회의록을\(를\) 스페이스 템플릿으로 복사/ }),
    );

    const list = await screen.findByRole("list", { name: "템플릿 목록" });
    expect(await within(list).findByText("회의록")).toBeInTheDocument();

    const [copied] = await listTemplates("sp1");
    expect(copied.name).toBe("회의록");
    expect(copied.icon).toBe("📝");
    // 복사본은 원문 그대로다 — 변수는 이 템플릿으로 문서를 만들 때 치환된다
    expect(copied.content).toContain("{{date}}");
  });

  it("같은 이름이 이미 있으면 스토어 문구를 그대로 알린다", async () => {
    const user = userEvent.setup();
    await createTemplate("sp1", { name: "회의록", content: "먼저 있던 본문" });
    renderApp("/spaces/sp1/settings/templates");
    await screen.findByRole("heading", { level: 1, name: "템플릿" });

    await user.click(
      await screen.findByRole("button", { name: /회의록을\(를\) 스페이스 템플릿으로 복사/ }),
    );

    expect(await screen.findByText(/같은 이름의 템플릿이 이미 있습니다/)).toBeInTheDocument();
    // 기존 템플릿을 덮어쓰지 않는다
    expect((await listTemplates("sp1"))[0].content).toBe("먼저 있던 본문");
  });
});
