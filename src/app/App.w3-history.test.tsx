import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { MOCK_USERS } from "../mock/users";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("W3 이월 정리", () => {
  it("편집 URL의 spaceId가 페이지 소속과 다르면 올바른 스페이스의 편집 URL로 redirect한다", async () => {
    const T = "2026-07-01T00:00:00.000Z";
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({
        users: MOCK_USERS,
        spaces: [
          { id: "sp1", key: "DEV", name: "개발 위키", createdAt: T },
          { id: "sp2", key: "OPS", name: "운영 위키", createdAt: T },
        ],
        pages: [
          {
            id: "pgA", spaceId: "sp2", parentId: null, title: "운영 문서", body: "# 운영",
            position: 1, createdBy: "u1", updatedBy: "u1", createdAt: T, updatedAt: T,
          },
        ],
        versions: [],
        comments: [],
      }),
    );
    renderApp("/spaces/sp1/pages/pgA/edit"); // sp2 소속 페이지의 편집을 sp1 URL로 접근
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp2/pages/pgA/edit");
    });
    expect(await screen.findByPlaceholderText("제목 없음")).toHaveValue("운영 문서");
  });

  it("순환 parentId 데이터에서도 페이지 보기가 멈추지 않고 렌더된다 (ancestorsOf 방어)", async () => {
    const T = "2026-07-01T00:00:00.000Z";
    const base = {
      spaceId: "sp1", body: "본문", position: 1,
      createdBy: "u1", updatedBy: "u1", createdAt: T, updatedAt: T,
    };
    localStorage.setItem(
      "wiki.v1",
      JSON.stringify({
        users: MOCK_USERS,
        spaces: [{ id: "sp1", key: "DEV", name: "개발 위키", createdAt: T }],
        pages: [
          { ...base, id: "pgA", parentId: "pgB", title: "순환 A" },
          { ...base, id: "pgB", parentId: "pgA", title: "순환 B", position: 2 },
        ],
        versions: [],
        comments: [],
      }),
    );
    renderApp("/spaces/sp1/pages/pgA");
    // 가드가 없으면 ancestorsOf가 무한 루프에 빠져 이 시점에 도달하지 못한다
    expect(await screen.findByRole("heading", { level: 1, name: "순환 A" })).toBeInTheDocument();
    // 조상 체인은 순환을 만나기 전(pgB)까지만 브레드크럼(현재 위치)에 나타난다
    const crumbs = screen.getByRole("navigation", { name: "현재 위치" });
    expect(within(crumbs).getByRole("link", { name: "순환 B" })).toBeInTheDocument();
  });
});

describe("W3 버전 히스토리", () => {
  it("히스토리 모달에서 버전 목록(최신순)을 보고 v1을 선택하면 미리보기가 렌더된다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 히스토리" });
    // 버전 목록 최신순 — v2(이서연)가 먼저, v1(김찬호)이 나중
    const items = within(dialog).getAllByRole("button", { name: /^v\d/ });
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("v2");
    expect(items[0]).toHaveTextContent("이서연");
    expect(items[1]).toHaveTextContent("v1");
    expect(items[1]).toHaveTextContent("김찬호");
    // 기본 선택 = 최신(v2) → 현재 본문이 미리보기에 렌더
    expect(
      within(dialog).getByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).toBeInTheDocument();
    // v1 선택 → v1 본문(제목 h2 + 마크다운)으로 미리보기 교체
    await user.click(items[1]);
    expect(within(dialog).getByRole("heading", { name: "개발 위키" })).toBeInTheDocument();
    expect(within(dialog).getByText("초기 안내 문서입니다.")).toBeInTheDocument();
    expect(
      within(dialog).queryByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).not.toBeInTheDocument();
  });

  it("v1을 복원하면 모달이 닫히고 본문이 갱신되며 복원도 새 버전(v3)으로 쌓인다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 히스토리" });
    await user.click(within(dialog).getByRole("button", { name: /^v1/ }));
    await user.click(within(dialog).getByRole("button", { name: "이 버전으로 복원" }));
    // 모달 닫힘 + 성공 Toast
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("v1 버전으로 복원했습니다")).toBeInTheDocument();
    // 보기 화면 본문이 v1 내용으로 갱신 (setPage — 재조회 없이 즉시)
    expect(screen.getByRole("heading", { name: "개발 위키" })).toBeInTheDocument();
    expect(screen.getByText("초기 안내 문서입니다.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).not.toBeInTheDocument();
    // 히스토리가 끊기지 않는다 — 다시 열면 복원 결과가 v3(최신)
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const reopened = await screen.findByRole("dialog", { name: "버전 히스토리" });
    const reopenedItems = within(reopened).getAllByRole("button", { name: /^v\d/ });
    expect(reopenedItems).toHaveLength(3);
    expect(reopenedItems[0]).toHaveTextContent("v3");
  });

  it("현재와 동일한 버전(v2)을 복원하면 '변경 없음' 정보 Toast가 뜨고 버전이 쌓이지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const dialog = await screen.findByRole("dialog", { name: "버전 히스토리" });
    // 기본 선택이 이미 v2(최신 = 현재 내용) — 그대로 복원 시도
    await user.click(within(dialog).getByRole("button", { name: "이 버전으로 복원" }));
    expect(await screen.findByText("현재 내용과 동일합니다 — 변경 없음")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // 버전이 쌓이지 않았다 — 다시 열어도 v2·v1 그대로
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    const reopened = await screen.findByRole("dialog", { name: "버전 히스토리" });
    expect(within(reopened).getAllByRole("button", { name: /^v\d/ })).toHaveLength(2);
  });
});
