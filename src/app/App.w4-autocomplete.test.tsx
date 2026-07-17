import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  // 이전 테스트의 에디터 destroy가 setTimeout(0)으로 지연 발화될 수 있어, 그 사이 이 테스트가
  // "아직 안 지워진 이전 인스턴스"를 자기 것으로 착각하지 않도록 매 테스트 시작 전 명시적으로 비운다.
  editorRegistry.current = null;
});

/**
 * jsdom에서 contenteditable 타이핑 시뮬레이션은 불안정하므로, editorRegistry로 실제 에디터
 * 인스턴스에 접근해 트랜잭션을 직접 디스패치한다. insertContent로 Suggestion 트리거(char: "[[")가
 * 반응하는 것을 확인했다 — @tiptap/suggestion은 키 입력이 아니라 트랜잭션 적용(state.apply)마다
 * 커서 앞 텍스트를 정규식으로 매치하므로, insertContent가 만든 트랜잭션에도 동일하게 반응한다.
 */
describe("W4 [[ 자동완성", () => {
  it("[[ 뒤 글자로 제목을 필터하고 Enter로 [[제목]]을 완성한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("[[개").run();
    const listbox = await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(listbox).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "개발 환경 설정" })).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(editorRegistry.current!.storage.markdown.getMarkdown()).toContain("[[개발 환경 설정]]");
  });

  it("화살표로 항목을 이동하고 Escape로 닫는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("[[").run(); // 전체 목록(최대 8) 표시
    await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(screen.getByRole("option", { name: "시작하기" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    // listPages()는 position 필드로 정렬(부모/자식 구분 없이) — sp1 시드 데이터에서 시작하기(위치1) 다음은
    // "개발 환경 설정"(pg1의 자식, 위치1)이다. 목록 두 번째 항목이 하이라이트되는지만 검증한다.
    expect(screen.getByRole("option", { name: "개발 환경 설정" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // 링크가 완성되지 않았음(위키 링크 노드로 승격되지 않음)만 확인 — 마크다운 직렬화 시
    // "[["는 이스케이프될 수 있으므로 대괄호 문자 수만 본다
    const markdown = editorRegistry.current!.storage.markdown.getMarkdown();
    expect(markdown).not.toContain("]]");
    expect((markdown.match(/\[/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("클릭으로도 선택할 수 있다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("메모: [[팀").run();
    const option = await screen.findByRole("option", { name: "팀 규칙" });
    // 실제 클릭(mousedown) 핸들러는 option(li) 안의 button에 달려 있다 — li 자체를 클릭하면 버블링 없이 무시된다
    await user.click(within(option).getByRole("button"));
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
    expect(editorRegistry.current!.storage.markdown.getMarkdown()).toContain("메모: [[팀 규칙]]");
  });

  it("[[제목]] 문법이 표현할 수 없는 제목([ ] 포함)은 제안하지 않는다", async () => {
    await createPage({ spaceId: "sp1", parentId: null, title: "[초안] 계획", body: "" });
    renderApp("/spaces/sp1/pages/new");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.commands.insertContent("[[");
    await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(screen.queryByRole("option", { name: "[초안] 계획" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "시작하기" })).toBeInTheDocument();
  });

  it("후보가 0개면 팝업을 띄우지 않는다", async () => {
    renderApp("/spaces/sp1/pages/new");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.commands.insertContent("[[존재하지않는제목쿼리");
    // 팝업이 생기지 않음을 안정적으로 확인 — findBy로 잠깐 대기했다가 없음을 재확인
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // 회귀: 리뷰어 Important #1 — @tiptap/suggestion은 트랜잭션 기반이라 blur만으로 onExit이
  // 발화하지 않는다. WikiEditor가 editor.on("blur", ...)로 팝업을 직접 닫아야 한다.
  it("포커스가 밖으로 나가면(blur) 드롭다운이 닫힌다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("[[개").run();
    await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    await user.click(screen.getByLabelText("페이지 제목"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // 회귀: 리뷰어 Important #2 — 후보 0개 상태에서 ArrowDown/Up을 누르면 highlight가
  // (0 + 1) % 0 = NaN이 되어, 이후 Enter가 items[NaN](undefined)로 command를 호출해 크래시했다.
  // 0개일 때는 무시하고, 쿼리를 다시 매치되게 고치면 highlight가 0으로 정상 복구되는지도 함께 검증한다.
  it("후보 0개에서 ArrowDown은 무시되고, 쿼리 복구 후 highlight가 정상화된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/new");
    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    editorRegistry.current!.chain().focus().insertContent("[[zzz").run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // highlight=NaN 크래시 없이 무시되어야 한다 — 예외가 던져지면 이 await 자체가 실패한다
    await user.keyboard("{ArrowDown}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // "zzz"를 지워 다시 전체 후보가 매치되게 한다 — jsdom에서 연속 Backspace 키 이벤트가 간헐적으로
    // 유실돼(hasFocus 타이밍 이슈로 추정) 신뢰성이 낮으므로, 트랜잭션을 직접 디스패치해 확정적으로 지운다.
    // 커서는 insertContent 직후 텍스트 끝에 있으므로 selection.to 기준으로 마지막 3글자를 지운다
    // (doc.content.size는 문단 닫힘 토큰까지 포함해 경계가 하나 어긋난다 — 이번에 직접 겪은 함정).
    const pos = editorRegistry.current!.state.selection.to;
    editorRegistry.current!.commands.deleteRange({ from: pos - 3, to: pos });
    await screen.findByRole("listbox", { name: "페이지 링크 자동완성" });
    expect(screen.getByRole("option", { name: "시작하기" })).toHaveAttribute("aria-selected", "true");
    // Enter도 안전하게 동작(command(undefined) 크래시 없음) — items[0]인 "시작하기"가 완성된다
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(editorRegistry.current!.storage.markdown.getMarkdown()).toContain("[[시작하기]]");
  });
});
