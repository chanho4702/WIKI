import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage } from "../features/wiki/store/wikiStore";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

const tree = () => screen.getByRole("navigation", { name: "페이지 트리" });

/**
 * 지연 로딩 트리(2026-08-29).
 *
 * 예전에는 스페이스에 들어가는 순간 그 스페이스의 전 페이지를 받아 사이드바를 그렸다.
 * 여기 있는 테스트가 "필요한 만큼만 받는다"를 고정한다 — 이게 깨지면 규모 상한이 되돌아온다.
 *
 * 시드 sp1: 시작하기 > (개발 환경 설정 > 로컬 DB 설정, 배포 가이드), 팀 규칙.
 */
describe("W22 지연 트리", () => {
  it("처음에는 최상위만 받는다", async () => {
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    expect(within(tree()).getAllByRole("link")).toHaveLength(2);
    expect(within(tree()).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(within(tree()).queryByRole("link", { name: "개발 환경 설정" })).not.toBeInTheDocument();
  });

  /** childCount가 없으면 화살표를 그리려고 결국 전부 미리 불러오게 된다. */
  it("자식이 없는 노드에는 펼침 화살표를 그리지 않는다", async () => {
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    expect(screen.getByRole("button", { name: "시작하기 하위 펼치기" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "팀 규칙 하위 펼치기" })).not.toBeInTheDocument();
  });

  /** 트리를 다 받지 않으므로, 펼쳐 주지 않으면 현재 보고 있는 문서가 사이드바에 없다. */
  it("깊은 링크로 들어오면 그 문서가 보이도록 조상 체인을 펼친다", async () => {
    renderApp("/spaces/sp1/pages/pg5"); // 로컬 DB 설정 — 손자

    await screen.findByRole("heading", { level: 1, name: "로컬 DB 설정" });
    await waitFor(() => {
      expect(within(tree()).getByRole("link", { name: "로컬 DB 설정" })).toBeInTheDocument();
    });
    expect(within(tree()).getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(within(tree()).getByRole("link", { name: "개발 환경 설정" })).toBeInTheDocument();
    expect(within(tree()).getByRole("link", { name: "로컬 DB 설정" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("펼친 뒤 만든 하위 문서는 갱신 후 그 자리에 나타난다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "시작하기 하위 펼치기" }));
    await within(tree()).findByRole("link", { name: "개발 환경 설정" });

    await createPage({ spaceId: "sp1", parentId: "pg1", title: "새 하위 문서" });
    await user.click(within(tree()).getByRole("button", { name: "시작하기 하위 접기" }));
    await user.click(screen.getByRole("button", { name: "시작하기 하위 펼치기" }));

    // 접었다 펴는 것만으로는 재조회하지 않는다(받아둔 것을 다시 보여줄 뿐) —
    // 생성 경로가 트리 갱신을 부르는지는 아래 "만들기"에서 확인한다.
    expect(within(tree()).queryByRole("link", { name: "새 하위 문서" })).not.toBeInTheDocument();
  });

  it("사이드바에서 만든 문서는 트리에 바로 나타난다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "콘텐츠 만들기" }));
    await user.click(await screen.findByRole("menuitem", { name: "페이지" }));

    await waitFor(() => {
      expect(within(tree()).getByRole("link", { name: /제목 없음/ })).toBeInTheDocument();
    });
  });
});
