import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// CSS 소스 검사는 App.w7-dark-theme / App.w5-width와 동일한 ?raw 패턴 — 문서 전체에 걸리는
// 전역 규칙(@media, :root)은 jsdom이 계산해주지 않으므로 소스 존재를 계약으로 고정한다.
import css from "./app.css?raw";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import * as store from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  vi.restoreAllMocks();
});

describe("W10 접근성 — 스킵 링크와 본문 랜드마크", () => {
  it("스킵 링크가 본문(#wiki-main)을 가리키고, 그 대상이 포커스를 받을 수 있다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/home");

    const skip = await screen.findByRole("link", { name: "본문으로 건너뛰기" });
    expect(skip).toHaveAttribute("href", "#wiki-main");

    // 스킵 링크가 실제로 도달 가능해야 한다 — id가 붙은 대상이 존재하고 tabindex=-1로
    // 프로그램적 포커스를 받을 수 있어야 앵커 점프가 낭독 위치를 옮긴다.
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "wiki-main");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("스킵 링크는 문서의 첫 포커스 가능 요소다 — Tab 한 번으로 닿는다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/home");
    await screen.findByRole("link", { name: "본문으로 건너뛰기" });

    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "본문으로 건너뛰기" }));
  });

  it("본문 랜드마크(main)는 화면마다 하나뿐이다 — 셸의 것과 중첩되지 않는다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));

    // 홈
    const home = renderApp("/home");
    await screen.findByRole("heading", { name: "마지막 작업하던 곳에서 다시 시작" });
    expect(screen.getAllByRole("main")).toHaveLength(1);
    home.unmount();

    // 스페이스 디렉토리
    const dir = renderApp("/spaces");
    await screen.findByRole("heading", { level: 1, name: "스페이스" });
    expect(screen.getAllByRole("main")).toHaveLength(1);
    dir.unmount();

    // 페이지 보기
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});

describe("W10 라우트 전환 시 본문 스크롤 리셋", () => {
  it("다른 페이지로 이동하면 본문 스크롤이 맨 위로 돌아간다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1/pages/pg1");
    await screen.findByRole("heading", { level: 1, name: "시작하기" });

    // .wiki-content가 스크롤 컨테이너다(뷰포트가 아니다) — 긴 페이지를 읽던 위치를 흉내낸다.
    const main = screen.getByRole("main");
    main.scrollTop = 500;
    expect(main.scrollTop).toBe(500);

    // 사이드바 트리에서 다른 페이지로 이동
    const tree = await screen.findByRole("navigation", { name: "페이지 트리" });
    const otherLink = Array.from(tree.querySelectorAll("a")).find(
      (a) => a.getAttribute("href") !== "/spaces/sp1/pages/pg1",
    );
    expect(otherLink).toBeDefined();
    await user.click(otherLink!);

    await waitFor(() => {
      expect(screen.getByRole("main").scrollTop).toBe(0);
    });
  });

  it("사이드바 토글처럼 라우트가 그대로인 조작은 포커스를 본문으로 가져가지 않는다", async () => {
    // 리다이렉트(`/` → 첫 스페이스 → 첫 페이지)도 pathname 변경이므로, 스크롤 리셋 effect가
    // 포커스까지 건드리면 사용자가 방금 누른 컨트롤에서 포커스가 빠져나간다. 그 회귀를 막는다.
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp();
    await screen.findByRole("navigation", { name: "페이지 트리" });

    const toggle = screen.getByRole("button", { name: "사이드바 토글" });
    await user.click(toggle);
    expect(document.activeElement).toBe(toggle);
  });
});

describe("W10 스켈레톤 로딩", () => {
  // 목업 스토어는 즉시 resolve하므로 로딩 프레임이 한 틱만 존재한다 — 응답을 붙잡아
  // (never-resolving) 로딩 상태를 결정적으로 고정한다.
  const pending = <T,>() => new Promise<T>(() => {});

  it("페이지 로딩 중에는 스켈레톤을 보여주고, 진행 상태를 문구로 함께 알린다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    vi.spyOn(store, "getPage").mockReturnValue(pending());
    renderApp("/spaces/sp1/pages/pg1");

    // 시각 자리표시(aria-hidden)와 별개로 스크린리더용 status 문구가 있어야 한다.
    // (ToastProvider도 빈 role=status 영역을 두므로 역할이 아니라 문구로 찾는다.)
    expect(await screen.findByText("페이지 로딩 중")).toHaveAttribute("role", "status");
    expect(document.querySelectorAll(".wiki-skeleton").length).toBeGreaterThan(0);

    // 빈 회색 블록이 낭독되지 않도록 접근성 트리에서 제외한다.
    expect(document.querySelector(".page-view-skeleton")).toHaveAttribute("aria-hidden", "true");
  });

  it("로드가 끝나면 스켈레톤이 사라지고 본문이 그 자리에 들어온다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1/pages/pg1");

    await screen.findByRole("heading", { level: 1, name: "시작하기" });
    // 본문 자리 스켈레톤이 사라졌는지를 본다 — 댓글 등 다른 영역은 각자 로딩 스켈레톤을
    // 가질 수 있어(2026-08-23 스켈레톤 확대) 전체 0개 단정은 병렬 타이밍 플레이크였다.
    expect(document.querySelector(".page-view-skeleton")).toBeNull();
    // 댓글 스켈레톤까지 정리되는 것도 최종적으로 보장한다(로드 완료 대기)
    await waitFor(() =>
      expect(document.querySelectorAll(".wiki-skeleton")).toHaveLength(0),
    );
  });

  it("홈 '이어서 작업'도 로딩 중 카드 자리를 미리 잡는다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    localStorage.setItem(
      "wiki.ui.recentVisits",
      JSON.stringify([{ id: "pg1", at: "2026-07-20T00:00:00.000Z" }]),
    );
    vi.spyOn(store, "getPage").mockReturnValue(pending());
    renderApp("/home");

    expect(await screen.findByText("불러오는 중")).toHaveAttribute("role", "status");
    // 자리표시 카드는 실제 카드 그리드(.home-resume-grid)와 같은 셀로 그려 로드 후 밀리지 않는다.
    const skeletonCards = document.querySelectorAll(".home-resume-card-skeleton");
    expect(skeletonCards.length).toBeGreaterThan(0);
  });
});

describe("W10 전역 CSS 계약 (소스 검사)", () => {
  it("prefers-reduced-motion: reduce에서 상태 전환(transition)을 전역으로 없앤다", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
    expect(block).not.toBeNull();
    const body = block![1];
    // DS 컴포넌트(Card/Switch/Select/Table 등)까지 덮으려면 전역 셀렉터 + !important가 필요하다.
    expect(body).toContain("*::before");
    expect(body).toContain("transition-duration: 0.01ms !important");
  });

  it("reduced-motion이 진행 표시 애니메이션을 정지시키지 않는다 — 감속만 한다", () => {
    // 전역 셀렉터로 animation-duration을 죽이면 DS Spinner(role=status)와 Button 로딩
    // 스피너까지 !important로 덮여 멈춘다 — 로딩이 중단된 것처럼 보이는 회귀를 막는다.
    const globalBlock = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,[\s\S]*?\n\}/.exec(css);
    expect(globalBlock).not.toBeNull();
    expect(globalBlock![0]).not.toContain("animation-duration");

    // 스켈레톤 펄스는 정지가 아니라 감속으로 처리한다.
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.wiki-skeleton \{\s*animation-duration: [\d.]+s;/,
    );
  });

  it("color-scheme을 테마별로 선언해 네이티브 위젯(스크롤바·select)이 함께 어두워진다", () => {
    const rootBlock = /(?:^|\n):root\s*\{([^}]*)\}/.exec(css);
    expect(rootBlock).not.toBeNull();
    expect(rootBlock![1]).toContain("color-scheme: light");

    const darkBlock = /\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
    expect(darkBlock).not.toBeNull();
    expect(darkBlock![1]).toContain("color-scheme: dark");
  });

  it("스킵 링크는 화면에서 밀어내되 포커스를 받을 수 있게 숨긴다(display: none 금지)", () => {
    const block = /\n\.wiki-skip-link \{([^}]*)\}/.exec(css);
    expect(block).not.toBeNull();
    // display:none / visibility:hidden은 포커스를 못 받아 스킵 링크가 동작하지 않는다.
    expect(block![1]).not.toMatch(/display:\s*none/);
    expect(block![1]).not.toMatch(/visibility:\s*hidden/);
    expect(block![1]).toContain("transform: translateY(");
    // 포커스 시 화면으로 들어와야 한다. :focus-visible이 아니라 :focus여야 한다 —
    // focus-visible은 "키보드로 온 포커스인가"를 휴리스틱으로 판단해서, 프로그램적 focus()로는
    // 걸리지 않을 수 있고 그러면 링크가 숨은 채 포커스만 받는다.
    expect(css).toMatch(/\.wiki-skip-link:focus \{[^}]*transform: translateY\(0\)/);
    expect(css).not.toContain(".wiki-skip-link:focus-visible");
  });

  it("포커스 링·트랜지션은 하드코딩이 아니라 DS 토큰을 참조한다", () => {
    // 앱 로컬 커스텀 컨트롤도 DS 버튼과 같은 링을 쓴다.
    expect(css).toContain(".global-nav-item:focus-visible");
    expect(css).toContain(".top-toolbar button:focus-visible");

    // 시간값 하드코딩(0.15s 등)이 남아있지 않다 — 전역 reduced-motion 규칙과 리듬을 맞추기 위해
    // 전부 --chanho-transition-* 토큰을 경유한다.
    const hardcodedDurations = css.match(/transition:[^;]*\b\d+(\.\d+)?m?s\b/g);
    expect(hardcodedDurations).toBeNull();
  });

  it("뷰포트 고정 높이는 dvh 폴백을 함께 둔다 — 모바일 주소창에 사이드바 푸터가 잘리지 않는다", () => {
    const block = /\.wiki-layout \{([\s\S]*?)\}/.exec(css);
    expect(block).not.toBeNull();
    expect(block![1]).toContain("height: 100vh"); // 미지원 브라우저 폴백
    expect(block![1]).toContain("height: 100dvh");
  });
});
