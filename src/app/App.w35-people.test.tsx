import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp, seedOrgState } from "./testUtils";
import { __resetForTest, createPage, getPage } from "../features/wiki/store/wikiStore";
import { editorRegistry } from "../features/wiki/editor/editorTestRegistry";
import type { WikiData } from "../features/wiki/store/types";

/*
 * F-07 사람 프로필 — @멘션·작성자 이름·아바타가 `/people/:id`로 간다. 프로필은 이름·이메일·팀(조직 전원 공개)과
 * 최근 작업한 문서 중 **내가 볼 수 있는 것만**(초안은 작성자·스페이스 관리자·전역 관리자만) 보인다.
 */

/** 시드를 만든 뒤 저장소를 직접 고친다(목업 CURRENT_USER가 아닌 사람의 문서·상태를 만들려고). */
function editData(fn: (data: WikiData) => void): void {
  const raw = localStorage.getItem("wiki.v1");
  if (!raw) throw new Error("시드를 먼저 저장한 뒤 호출하세요");
  const data = JSON.parse(raw) as WikiData;
  fn(data);
  localStorage.setItem("wiki.v1", JSON.stringify(data));
  __resetForTest();
}

/** 멘션 저장 문법은 숫자 id만 멘션으로 승격한다(`user:\d+`, 서버와 같다) — 목업 사람 하나를 숫자 id로 더한다. */
async function seedNumericPerson(): Promise<void> {
  await getPage("pg1"); // 시드를 저장소에 쓴다
  editData((data) => {
    data.users.push({ id: "7", name: "정하늘" });
  });
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("F-07 사람 프로필 화면", () => {
  it("이름·이메일·팀과 그 사람이 작업한 문서를 보여 준다", async () => {
    renderApp("/people/u2");

    expect(await screen.findByRole("heading", { level: 1, name: "이서연" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "u2@example.com" })).toHaveAttribute("href", "mailto:u2@example.com");
    expect(screen.getByText("플랫폼팀")).toBeInTheDocument();

    const table = await screen.findByRole("table", { name: "이서연 님이 최근 작업한 문서" });
    // u2가 만들었거나(pg3·pg5) 마지막으로 고친(pg1) 문서 — u3의 문서(pg4)는 없다
    expect(within(table).getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/spaces/sp1/pages/pg1");
    expect(within(table).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: "배포 가이드" })).not.toBeInTheDocument();
  });

  it("비활성 구성원은 '비활성' 표시와 문서 목록만 보인다", async () => {
    await createPage({ spaceId: "sp1", title: "아무거나", body: "" });
    editData((data) => {
      data.org = { memberStatus: { u2: "DEACTIVATED" } };
    });
    renderApp("/people/u2");

    expect(await screen.findByRole("heading", { level: 1, name: "이서연" })).toBeInTheDocument();
    expect(screen.getByText("비활성")).toBeInTheDocument();
    expect(screen.queryByText("u2@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("플랫폼팀")).not.toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "이서연 님이 최근 작업한 문서" })).toBeInTheDocument();
  });

  it("없는 사람이면 '사용자를 찾을 수 없습니다'", async () => {
    renderApp("/people/u404");
    expect(await screen.findByText("사용자를 찾을 수 없습니다")).toBeInTheDocument();
  });

  it("사용자 메뉴의 내 이름을 고르면 내 프로필로 간다", async () => {
    const user = userEvent.setup();
    renderApp("/home");
    await user.click(await screen.findByRole("button", { name: "사용자 메뉴" }));
    await user.click(await screen.findByRole("menuitem", { name: /내 프로필 보기/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "김찬호" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/people/u1");
  });
});

describe("F-07 프로필의 초안 가시성 — 작성자·스페이스 관리자·전역 관리자만", () => {
  async function seedForeignDraft(): Promise<void> {
    await createPage({ spaceId: "sp1", title: "이서연의 초안", body: "쓰는 중", status: "draft" });
    editData((data) => {
      const draft = data.pages.find((p) => p.title === "이서연의 초안")!;
      draft.createdBy = "u2";
      draft.updatedBy = "u2";
    });
  }

  it("관리자가 아니면 남의 초안은 프로필 목록에 없다", async () => {
    await seedForeignDraft();
    seedOrgState({ self: { status: "ACTIVE", globalRoles: [] } });
    renderApp("/people/u2");

    const table = await screen.findByRole("table", { name: "이서연 님이 최근 작업한 문서" });
    expect(within(table).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: "이서연의 초안" })).not.toBeInTheDocument();
  });

  it("전역 관리자에게는 초안이 '초안' 표시와 함께 보인다", async () => {
    await seedForeignDraft();
    renderApp("/people/u2");

    const table = await screen.findByRole("table", { name: "이서연 님이 최근 작업한 문서" });
    const row = within(table).getByRole("link", { name: "이서연의 초안" }).closest("tr")!;
    expect(within(row).getByText("초안")).toBeInTheDocument();
  });

  it("볼 수 없는 초안 아래의 하위 문서도 함께 가려진다(조상 체인)", async () => {
    await seedForeignDraft();
    editData((data) => {
      const draft = data.pages.find((p) => p.title === "이서연의 초안")!;
      const pg3 = data.pages.find((p) => p.id === "pg3")!;
      pg3.parentId = draft.id;
    });
    seedOrgState({ self: { status: "ACTIVE", globalRoles: [] } });
    renderApp("/people/u2");

    const table = await screen.findByRole("table", { name: "이서연 님이 최근 작업한 문서" });
    expect(within(table).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(within(table).queryByRole("link", { name: "개발 환경 설정" })).not.toBeInTheDocument();
  });
});

describe("F-07 @멘션·작성자 → 프로필", () => {
  it("본문의 @멘션을 누르면 그 사람의 프로필로 간다", async () => {
    const user = userEvent.setup();
    await seedNumericPerson();
    const page = await createPage({ spaceId: "sp1", title: "담당 정리", body: "담당: [@정하늘](user:7) 확인" });
    renderApp(`/spaces/sp1/pages/${page.id}`);

    const mention = await screen.findByRole("link", { name: "@정하늘" });
    expect(mention).toHaveAttribute("href", "/people/7");
    await user.click(mention);

    expect(await screen.findByRole("heading", { level: 1, name: "정하늘" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/people/7");
  });

  it("@멘션에 마우스를 올리면 프로필 카드(이름·이메일·프로필 보기)가 뜬다", async () => {
    const user = userEvent.setup();
    await seedNumericPerson();
    const page = await createPage({ spaceId: "sp1", title: "담당 정리", body: "담당: [@정하늘](user:7)" });
    renderApp(`/spaces/sp1/pages/${page.id}`);

    await user.hover(await screen.findByRole("link", { name: "@정하늘" }));
    const card = await screen.findByRole("dialog", { name: "정하늘 프로필 카드" });
    expect(await within(card).findByText("7@example.com")).toBeInTheDocument();
    await user.click(within(card).getByRole("link", { name: "프로필 보기" }));
    expect(await screen.findByRole("heading", { level: 1, name: "정하늘" })).toBeInTheDocument();
  });

  it("키보드 포커스로도 카드가 열리고 Escape로 닫힌다", async () => {
    const user = userEvent.setup();
    await seedNumericPerson();
    const page = await createPage({ spaceId: "sp1", title: "담당 정리", body: "담당: [@정하늘](user:7)" });
    renderApp(`/spaces/sp1/pages/${page.id}`);

    const mention = await screen.findByRole("link", { name: "@정하늘" });
    mention.focus();
    expect(await screen.findByRole("dialog", { name: "정하늘 프로필 카드" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "정하늘 프로필 카드" })).not.toBeInTheDocument());
    expect(mention).toHaveFocus();
  });

  it("문서 메타 줄의 마지막 편집자를 누르면 그 사람의 프로필로 간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");

    // pg1의 마지막 편집자는 u2(이서연)
    await user.click(await screen.findByRole("link", { name: "이서연" }));
    expect(await screen.findByRole("heading", { level: 1, name: "이서연" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/people/u2");
  });

  it("편집 화면의 멘션은 링크가 아니다 — 누르면 편집이 이어진다", async () => {
    await seedNumericPerson();
    const page = await createPage({ spaceId: "sp1", title: "담당 정리", body: "담당: [@정하늘](user:7)" });
    renderApp(`/spaces/sp1/pages/${page.id}/edit`);

    await waitFor(() => expect(editorRegistry.current).toBeTruthy());
    await waitFor(() => expect(document.querySelector(".ProseMirror .user-mention")).not.toBeNull());
    expect(screen.queryByRole("link", { name: "@정하늘" })).not.toBeInTheDocument();
  });

  it("읽기 전용(공개 문서) 인스턴스에서는 멘션이 링크가 아니다", async () => {
    await seedNumericPerson();
    const page = await createPage({ spaceId: "sp1", title: "담당 정리", body: "담당: [@정하늘](user:7)" });
    renderApp(`/spaces/sp1/pages/${page.id}`, { readOnly: true });

    await screen.findByRole("heading", { level: 1, name: "담당 정리" });
    expect(document.querySelector(".user-mention")).toHaveTextContent("@정하늘");
    expect(screen.queryByRole("link", { name: "@정하늘" })).not.toBeInTheDocument();
  });
});
