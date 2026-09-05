import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, getVersion, listVersions, updatePage } from "../features/wiki/store/wikiStore";
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
  it("히스토리 화면의 표에서 버전 목록(최신순)을 보고 v. 1 링크로 그 시점 본문을 연다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    // 버전 표 최신순 — v. 2(이서연)가 먼저, v. 1(김찬호)이 나중
    const rows = screen.getAllByRole("row").slice(1); // 헤더 제외
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole("link", { name: "v. 2" })).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("이서연");
    expect(within(rows[1]).getByRole("link", { name: "v. 1" })).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("김찬호");

    // v. 1 링크 → 이전 버전 보기에 그 시점 본문
    await user.click(within(rows[1]).getByRole("link", { name: "v. 1" }));
    expect(await screen.findByRole("heading", { name: "개발 위키" })).toBeInTheDocument();
    expect(screen.getByText("초기 안내 문서입니다.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).not.toBeInTheDocument();
  });

  it("v. 1을 복원하면 보기 화면으로 돌아가고 복원도 새 버전(v. 3)으로 쌓인다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1/history");
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    const rows = screen.getAllByRole("row").slice(1);
    await user.click(within(rows[1]).getByRole("button", { name: "이 버전으로 복원" }));
    const dialog = await screen.findByRole("dialog", { name: "v. 1으로 복원할까요?" });
    await user.click(within(dialog).getByRole("button", { name: "복원" }));

    // 확인 모달이 닫히고 성공 Toast + 보기 화면으로 이동
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("v1 버전으로 복원했습니다")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toBe("/spaces/sp1/pages/pg1");
    });

    // 보기 화면 본문이 v1 내용으로 갱신
    expect(await screen.findByRole("heading", { name: "개발 위키" })).toBeInTheDocument();
    expect(screen.getByText("초기 안내 문서입니다.")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).not.toBeInTheDocument();

    // 히스토리가 끊기지 않는다 — 다시 열면 복원 결과가 v. 3(최신)
    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });
    const reopened = screen.getAllByRole("row").slice(1);
    expect(reopened).toHaveLength(3);
    expect(within(reopened[0]).getByRole("link", { name: "v. 3" })).toBeInTheDocument();
  });

  it("현재 내용과 같은 버전을 복원하면 '변경 없음' 정보 Toast가 뜨고 버전이 쌓이지 않는다", async () => {
    const user = userEvent.setup();
    // 현재 버전 행에는 복원 버튼이 없다 — no-op은 "옛 버전인데 내용이 지금과 같은" 경우다
    const seedVersion = (await listVersions("pg2"))[0];
    const original = await getVersion("pg2", seedVersion.id);
    await updatePage("pg2", { body: "임시 수정" }); // v2
    await updatePage("pg2", { body: original.body }); // v3 = v1과 같은 내용
    renderApp("/spaces/sp1/pages/pg2/history");
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);
    await user.click(within(rows[2]).getByRole("button", { name: "이 버전으로 복원" })); // v. 1
    const dialog = await screen.findByRole("dialog", { name: "v. 1으로 복원할까요?" });
    await user.click(within(dialog).getByRole("button", { name: "복원" }));

    expect(await screen.findByText("현재 내용과 동일합니다 — 변경 없음")).toBeInTheDocument();
    // 버전이 쌓이지 않았다
    expect(await listVersions("pg2")).toHaveLength(3);
  });
});
