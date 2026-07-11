import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
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
    expect(await screen.findByLabelText("제목")).toHaveValue("운영 문서");
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
    // 조상 체인은 순환을 만나기 전(pgB)까지만 브레드크럼에 나타난다
    const crumbs = screen.getByRole("navigation", { name: "브레드크럼" });
    expect(within(crumbs).getByRole("link", { name: "순환 B" })).toBeInTheDocument();
  });
});
