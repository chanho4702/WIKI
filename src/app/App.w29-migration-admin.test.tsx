import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * 컨플루언스 DC 마이그레이션 관리(W29, M1) — `/admin/migrations`.
 *
 * 목업은 고정 시나리오다: 발견 12건 → 폴링마다 3건씩 → 경고 2종(`MACRO_OPAQUE`·
 * `ATTACHMENT_NOT_COPIED`) + 데드레터 1건(`DC_NOT_FOUND`).
 *
 * 파이프라인 테스트는 **가짜 타이머**로 5초 폴링을 흘려보낸다. 실제 시계를 기다리면 한 바퀴에
 * 20초가 걸리고 느린 CI에서 몇 틱이 지났는지가 달라진다. 대신 가짜 타이머 아래에서는
 * `findBy*`(내부적으로 waitFor가 실시간을 기다린다)를 쓰지 않는다 — 클릭 뒤에는 `settle()`로
 * 스토어 promise를 직접 풀고 `getBy*`로 확인한다.
 */

const SPACE_KEY = "DOCS";

/** 클릭이 부른 스토어 promise가 다 풀리고 화면이 다시 그려질 때까지. 두 타이머 모드에서 모두 동작한다. */
async function settle() {
  for (let hop = 0; hop < 3; hop += 1) {
    await act(async () => {
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
      else await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/** 폴링 한 번(5초) 분량을 흘려보낸다. 돌아온 뒤에는 화면이 이미 갱신돼 있다. */
async function pollOnce() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  await settle();
}

/**
 * 새 잡 폼을 채워 상세 화면까지 간다.
 *
 * 긴 문자열은 `type`이 아니라 `paste`로 넣는다 — 가짜 타이머 아래에서 한 글자마다 타이머를 돌리면
 * 폼 하나 채우는 데 테스트 예산이 다 간다(실제로 20초 한도를 넘겼다). 여기서 검증하려는 것은
 * 키 입력이 아니라 파이프라인이다.
 */
async function createJob(user: ReturnType<typeof userEvent.setup>, mode: "시험 실행" | "실제 이관") {
  await user.click(screen.getByLabelText("원본 컨플루언스 주소"));
  await user.paste("https://confluence.example.com");
  await user.click(screen.getByLabelText("원본 스페이스 키"));
  await user.paste(SPACE_KEY);
  await user.click(screen.getByLabelText("접근 토큰(PAT)"));
  await user.paste("pat-secret");

  await user.click(screen.getByRole("button", { name: /연결 확인/ }));
  await settle();
  expect(screen.getByText(/연결됨/)).toBeInTheDocument();

  await user.click(screen.getByRole("combobox", { name: "대상 스페이스" }));
  await settle();
  await user.click(screen.getByRole("option", { name: /개발 위키/ }));
  await settle();

  if (mode === "실제 이관") {
    await user.click(screen.getByRole("radio", { name: /실제 이관/ }));
  }
  await user.click(screen.getByRole("button", { name: /마이그레이션 만들기/ }));
  await settle();
  expect(screen.getByRole("heading", { level: 1, name: `${SPACE_KEY} 이관` })).toBeInTheDocument();
}

/** 발견 → 시작까지 몰아서. 각 테스트가 여기서부터 자기 관심사를 본다. */
async function discoverAndStart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /원본 발견/ }));
  await settle();
  expect(screen.getByText("완료 0 / 전체 12건 (0%)")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: /^시작/ }));
  await settle();
}

function pipelineUser() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe("W29 마이그레이션 관리 — 새 잡", () => {
  it("연결 확인이 원본 스페이스 이름과 페이지 수를 알린다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });

    await user.type(screen.getByLabelText("원본 컨플루언스 주소"), "https://confluence.example.com");
    await user.type(screen.getByLabelText("원본 스페이스 키"), SPACE_KEY);
    await user.type(screen.getByLabelText("접근 토큰(PAT)"), "pat-secret");
    await user.click(screen.getByRole("button", { name: /연결 확인/ }));

    expect(await screen.findByText(/제품 문서/)).toBeInTheDocument();
    expect(screen.getByText(/페이지 12건/)).toBeInTheDocument();
  });

  /** 토큰은 가려서 받는다 — 어깨너머로 읽히면 관리자 자격 증명 하나가 통째로 샌다. */
  it("토큰 입력은 가려지고 잡을 만든 뒤 화면 어디에도 남지 않는다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });

    expect(screen.getByLabelText("접근 토큰(PAT)")).toHaveAttribute("type", "password");

    await createJob(user, "시험 실행");

    expect(document.body.textContent).not.toContain("pat-secret");
  });

  it("주소·키·토큰이 다 차기 전에는 연결 확인도 만들기도 못 누른다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });

    expect(screen.getByRole("button", { name: /연결 확인/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /마이그레이션 만들기/ })).toBeDisabled();

    await user.type(screen.getByLabelText("원본 컨플루언스 주소"), "https://confluence.example.com");
    await user.type(screen.getByLabelText("원본 스페이스 키"), SPACE_KEY);
    await user.type(screen.getByLabelText("접근 토큰(PAT)"), "pat-secret");

    expect(screen.getByRole("button", { name: /연결 확인/ })).toBeEnabled();
    // 대상 스페이스를 고르기 전에는 여전히 만들 수 없다
    expect(screen.getByRole("button", { name: /마이그레이션 만들기/ })).toBeDisabled();
  });

  it("만든 잡이 목록에 남는다", async () => {
    const user = userEvent.setup();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });
    expect(await screen.findByRole("heading", { name: "아직 마이그레이션이 없습니다" })).toBeInTheDocument();

    await createJob(user, "시험 실행");

    await user.click(screen.getByRole("link", { name: /마이그레이션 목록/ }));
    const table = await screen.findByRole("table", { name: "마이그레이션 잡" });
    expect(within(table).getByText(SPACE_KEY)).toBeInTheDocument();
    expect(within(table).getByText("시험 실행")).toBeInTheDocument();
  });
});

describe("W29 마이그레이션 관리 — 파이프라인", () => {
  it("발견 → 시작 → 진행률 갱신 → 보고서·데드레터를 한 화면에서 본다", async () => {
    const user = pipelineUser();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });

    await createJob(user, "실제 이관");

    // 발견 전에는 시작할 것이 없다
    expect(screen.getByRole("button", { name: /^시작/ })).toBeDisabled();
    expect(screen.getByText("완료 0 / 전체 0건 (0%)")).toBeInTheDocument();

    await discoverAndStart(user);
    // 발견하면 원본 이름이 채워진다
    expect(screen.getByText("제품 문서")).toBeInTheDocument();
    expect(screen.getByText("완료 3 / 전체 12건 (25%)")).toBeInTheDocument();
    expect(screen.getByText("진행 중")).toBeInTheDocument();

    // 5초 폴링이 한 틱씩 진행시킨다
    await pollOnce();
    expect(screen.getByText("완료 6 / 전체 12건 (50%)")).toBeInTheDocument();
    await pollOnce();
    expect(screen.getByText("완료 9 / 전체 12건 (75%)")).toBeInTheDocument();
    await pollOnce();
    expect(screen.getByText("완료 11 / 전체 12건 (92%) · 데드레터 1건")).toBeInTheDocument();

    // 손실 보고서 — 심각도순, code별 건수, 대표 위치
    const issues = screen.getByRole("table", { name: "손실 보고서" });
    expect(within(issues).getByText("ATTACHMENT_NOT_COPIED")).toBeInTheDocument();
    expect(within(issues).getByText("MACRO_OPAQUE")).toBeInTheDocument();
    expect(within(issues).getByText("macro:jira")).toBeInTheDocument();

    // 데드레터 표 — 항목과 오류 코드
    const dead = screen.getByRole("table", { name: "데드레터" });
    expect(within(dead).getByText("100012")).toBeInTheDocument();
    expect(within(dead).getByText("DC_NOT_FOUND")).toBeInTheDocument();

    // 완료했으니 대상 스페이스로 갈 수 있다("열기"까지 붙여야 셸의 같은 이름과 갈린다)
    expect(screen.getByRole("link", { name: "개발 위키 열기" })).toHaveAttribute("href", "/spaces/sp1");
  });

  /** 끝난 뒤에도 계속 물으면 서버만 두드린다 — 완료 상태에서는 폴링이 멈춰야 한다. */
  it("완료한 뒤에는 더 폴링하지 않는다", async () => {
    const user = pipelineUser();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });

    await createJob(user, "실제 이관");
    await discoverAndStart(user);
    for (let tick = 0; tick < 3; tick += 1) await pollOnce();
    expect(screen.getByText("완료 11 / 전체 12건 (92%) · 데드레터 1건")).toBeInTheDocument();

    await pollOnce();
    await pollOnce();

    expect(screen.getByText("완료 11 / 전체 12건 (92%) · 데드레터 1건")).toBeInTheDocument();
    // 끝난 잡은 취소할 것도 없다 — "더 이상 움직이지 않는다"가 버튼으로도 드러난다
    expect(screen.getByRole("button", { name: /취소/ })).toBeDisabled();
  });

  it("취소하면 진행이 멈춘다", async () => {
    const user = pipelineUser();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });

    await createJob(user, "실제 이관");
    await discoverAndStart(user);
    expect(screen.getByText("완료 3 / 전체 12건 (25%)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /취소/ }));
    await settle();
    expect(screen.getByText("취소됨")).toBeInTheDocument();

    await pollOnce();
    await pollOnce();
    expect(screen.getByText("완료 3 / 전체 12건 (25%)")).toBeInTheDocument();
  });

  /** 시험 실행은 문서를 만들지 않는다 — 갈 곳이 없는데 링크를 띄우면 거짓말이다. */
  it("시험 실행은 완료해도 대상 스페이스 링크를 띄우지 않는다", async () => {
    const user = pipelineUser();
    renderApp("/admin/migrations");
    await screen.findByRole("heading", { level: 1, name: "마이그레이션" });

    await createJob(user, "시험 실행");
    await discoverAndStart(user);
    for (let tick = 0; tick < 3; tick += 1) await pollOnce();

    expect(screen.getByText("완료 11 / 전체 12건 (92%) · 데드레터 1건")).toBeInTheDocument();
    expect(screen.queryByText(/이관이 끝났습니다/)).not.toBeInTheDocument();
  });
});

describe("W29 마이그레이션 관리 — 접근", () => {
  it("없는 잡을 열면 그 사실을 알린다", async () => {
    renderApp("/admin/migrations/없는잡");

    expect(
      await screen.findByRole("heading", { name: "마이그레이션을 불러올 수 없습니다" }),
    ).toBeInTheDocument();
  });

  /** 전역 관리자가 아니면 메뉴에 띄우지 않는다 — 눌러 봐야 "권한 없음"만 나온다. */
  it("전역 관리자가 아니면 설정 메뉴에 마이그레이션 항목이 없다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "설정" }));

    expect(await screen.findByRole("menuitem", { name: /단축키 도움말/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /마이그레이션/ })).not.toBeInTheDocument();
  });
});
