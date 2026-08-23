import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StarredFlyout } from "./StarredFlyout";
import type { Space } from "../store/types";

const spaces: Space[] = [
  { id: "sp1", key: "DEV", name: "개발", createdAt: "" },
  { id: "sp2", key: "OPS", name: "운영", createdAt: "" },
];

describe("StarredFlyout — 별표 검색 패널", () => {
  it("별표된 스페이스·페이지가 섹션별로 뜨고, 검색어로 필터된다", async () => {
    const user = userEvent.setup();
    render(
      <StarredFlyout
        spaces={spaces}
        starredSpaceIds={["sp1"]}
        starredPages={[
          { id: "pg1", spaceId: "sp1", title: "배포 가이드", type: "page" },
          { id: "pg2", spaceId: "sp2", title: "온보딩", icon: "🚀", type: "page" },
        ]}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "개발 (DEV)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "배포 가이드" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "온보딩" })).toBeInTheDocument(); // 이모지는 aria-hidden — 접근 이름은 제목만

    await user.type(screen.getByRole("searchbox", { name: "별표 항목 검색" }), "배포");
    expect(screen.getByRole("button", { name: "배포 가이드" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "개발 (DEV)" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "온보딩" })).not.toBeInTheDocument();
  });

  it("페이지 클릭은 스냅샷의 스페이스 경로로 이동한다 — 다른 스페이스도 정확히", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <StarredFlyout
        spaces={spaces}
        starredSpaceIds={[]}
        starredPages={[{ id: "pg9", spaceId: "sp2", title: "온보딩", type: "folder" }]}
        onNavigate={onNavigate}
      />,
    );
    await user.click(screen.getByRole("button", { name: "온보딩" }));
    expect(onNavigate).toHaveBeenCalledWith("/spaces/sp2/folder/pg9");
  });

  it("메타가 없는 구버전 엔트리는 목록에서 제외되고, 아무것도 없으면 안내 문구", () => {
    render(
      <StarredFlyout
        spaces={spaces}
        starredSpaceIds={[]}
        starredPages={[{ id: "legacy", spaceId: "", title: "" }]}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText(/별표\(★\)를 누르면 여기에 모입니다/)).toBeInTheDocument();
  });
});
