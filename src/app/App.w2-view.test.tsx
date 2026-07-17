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

describe("W2 페이지 보기", () => {
  it("시드 pg1 본문을 마크다운으로 렌더한다 — heading·GFM 표·코드블록·메타", async () => {
    renderApp("/spaces/sp1/pages/pg1");
    // 페이지 제목 h1
    expect(await screen.findByRole("heading", { level: 1, name: "시작하기" })).toBeInTheDocument();
    // 본문 마크다운: h1/h2
    expect(
      screen.getByRole("heading", { name: "개발 위키에 오신 것을 환영합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "시작 순서" })).toBeInTheDocument();
    // GFM 표 — remark-gfm 없이는 table이 생기지 않는다 (W1 최종리뷰 인계 검증 겸용)
    expect(screen.getByRole("columnheader", { name: "명령어" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "타입 검사" })).toBeInTheDocument();
    // 코드블록 (highlight 토큰으로 분할되어도 코드 요소 내 텍스트가 존재하는지 확인)
    const codeElements = screen.getAllByRole("code");
    expect(
      codeElements.some((code) => code.textContent?.includes("export function greet")),
    ).toBe(true);
    // 메타: 수정자(u2 이서연) + 수정일 (T_UPDATE=2026-07-10T10:00:00Z — KST/UTC 모두 7월 10일)
    // W3에서 추가된 CommentSection의 시드 코멘트 c1도 작성자가 이서연이라 이름이 페이지에 두 번 나타난다.
    // 코멘트 영역(role=region "코멘트") 밖에서 찾아 페이지 메타 표기임을 명확히 한다.
    const commentRegion = await screen.findByRole("region", { name: "코멘트" });
    const metaEditorName = screen.getAllByText("이서연").find((el) => !commentRegion.contains(el));
    expect(metaEditorName).toBeInTheDocument();
    expect(screen.getByText(/2026년 7월 10일 수정/)).toBeInTheDocument();
    // 편집은 DS PageHeader actions의 primary Button (라우팅은 useNavigate onClick — App.w2-edit에서 검증)
    expect(screen.getByRole("button", { name: "편집" })).toBeInTheDocument();
    // 우상단 액션 — 히스토리 버튼 (W3에서 추가됨)
    expect(screen.getByRole("button", { name: "히스토리" })).toBeInTheDocument();
  });

  it("깊이 3 페이지의 Breadcrumbs가 스페이스/조상 경로를 링크로 보여주고 현재 페이지는 링크가 아니다", async () => {
    renderApp("/spaces/sp1/pages/pg5"); // pg5(로컬 DB 설정) ← pg3(개발 환경 설정) ← pg1(시작하기)
    // DS PageHeader breadcrumbs — nav aria-label "현재 위치", 항목은 href를 가진 앵커
    const crumbs = await screen.findByRole("navigation", { name: "현재 위치" });
    expect(within(crumbs).getByRole("link", { name: "개발 위키" })).toHaveAttribute(
      "href",
      "/spaces/sp1",
    );
    expect(within(crumbs).getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "href",
      "/spaces/sp1/pages/pg1",
    );
    // 조상 링크는 해당 조상 페이지로 연결된다
    expect(within(crumbs).getByRole("link", { name: "개발 환경 설정" })).toHaveAttribute(
      "href",
      "/spaces/sp1/pages/pg3",
    );
    // 현재 페이지는 링크가 아니다
    expect(within(crumbs).queryByRole("link", { name: "로컬 DB 설정" })).not.toBeInTheDocument();
    expect(within(crumbs).getByText("로컬 DB 설정")).toBeInTheDocument();
  });

  it("페이지의 spaceId와 URL의 spaceId가 다르면 올바른 스페이스 URL로 redirect한다", async () => {
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
    renderApp("/spaces/sp1/pages/pgA"); // sp2 소속 페이지를 sp1 URL로 접근
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp2/pages/pgA");
    });
    expect(await screen.findByRole("heading", { level: 1, name: "운영 문서" })).toBeInTheDocument();
  });

  it("하위가 있는 페이지 삭제는 거부되고 Toast로 안내한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1"); // pg1은 pg3·pg4의 부모
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(await screen.findByText("하위 페이지가 있어 삭제할 수 없습니다")).toBeInTheDocument();
    // 페이지와 URL은 그대로
    expect(screen.getByRole("heading", { level: 1, name: "시작하기" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg1");
  });

  it("하위가 없는 페이지는 삭제 후 부모로 이동하고 트리에서 사라진다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg5"); // pg5는 잎(leaf), 부모는 pg3
    await screen.findByRole("heading", { level: 1, name: "로컬 DB 설정" });
    await user.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pg3");
    });
    // reloadPages 검증 — 사이드바 트리에서 소멸
    const tree = screen.getByRole("navigation", { name: "페이지 트리" });
    expect(within(tree).queryByRole("link", { name: "로컬 DB 설정" })).not.toBeInTheDocument();
  });
});
