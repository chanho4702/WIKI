import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  getVersion,
  listVersions,
  restoreVersion,
  updatePage,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 버전 이력 완성(W22).
 *
 * 이전 한계 두 가지를 닫는다 — 비교가 직전 버전에 고정돼 있었고, 이력에 "무엇을 왜 고쳤는지"가
 * 없어 버전이 쌓이면 어느 것이 되돌릴 지점인지 알 수 없었다.
 */
describe("W22 변경 요약 — 스토어 계약", () => {
  it("저장할 때 남긴 요약이 그 버전에 붙는다", async () => {
    await updatePage("pg2", { body: "고침" }, { changeNote: "오타 수정" });

    const versions = await listVersions("pg2");
    expect(versions[0].changeNote).toBe("오타 수정");
    expect(versions[1].changeNote).toBeUndefined();
  });

  /** 공백만 적은 요약은 없는 것과 같다 — 화면이 빈 칩을 그리면 안 된다. */
  it("공백만 있는 요약은 없는 것으로 저장한다", async () => {
    await updatePage("pg2", { body: "고침" }, { changeNote: "   " });

    expect((await listVersions("pg2"))[0].changeNote).toBeUndefined();
  });

  it("복원은 어느 버전에서 되돌렸는지를 이력에 남긴다", async () => {
    const before = await listVersions("pg1");
    const oldest = before[before.length - 1];

    await restoreVersion("pg1", oldest.id);

    expect((await listVersions("pg1"))[0].changeNote).toBe(`v${oldest.version} 버전으로 복원`);
  });

  /** 목록은 메타만 준다 — 이력이 수십 개인 문서의 본문을 한 번에 실어 보내지 않는다. */
  it("본문은 단건 조회로 읽는다", async () => {
    const versions = await listVersions("pg1");

    const full = await getVersion("pg1", versions[0].id);

    expect(full.body).not.toBe("");
    expect(full.version).toBe(versions[0].version);
  });
});

describe("W22 버전 히스토리 — 화면", () => {
  /** 편집자 이름 스냅샷(W23) — 디렉터리에서 못 찾는 사람도 그때 이름으로 보인다. */
  it("버전에 저장 시점 편집자 이름이 남는다", async () => {
    await updatePage("pg2", { body: "고침" });

    const [latest] = await listVersions("pg2");
    expect(latest.savedByName).toBeTruthy();
  });

  it("이력 표의 변경 요약 칸에 그 요약이 보인다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "고침" }, { changeNote: "표 정리" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    const rows = screen.getAllByRole("row").slice(1); // 헤더 제외
    expect(rows[0]).toHaveTextContent("표 정리");
    // 요약을 남기지 않은 버전은 빈 칸이 아니라 "—"
    expect(rows[1]).toHaveTextContent("—");
  });

  /**
   * 요약 칸은 액션 바 높이(--edit-chrome-height)를 넘기지 않으려고 라벨을 화면에서 감춘다 —
   * 넘기면 바로 아래 sticky 툴바가 그만큼 안 내려가 스크롤할 때 에디터를 덮는다.
   * 감추는 것은 시각뿐이고 라벨-입력 연결은 남아야 한다.
   */
  it("변경 요약 칸은 라벨로 찾을 수 있고 그 요약이 버전에 붙는다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg2/edit");

    const note = await screen.findByLabelText("변경 요약 (선택)");
    await user.type(note, "머리말 정리");
    // 요약만으로는 새 버전이 생기지 않는다 — 실제로 고친 것이 있어야 저장이 이력을 남긴다.
    const title = screen.getByRole("textbox", { name: "페이지 제목" });
    await user.clear(title);
    await user.type(title, "팀 규칙 2026");
    await user.click(screen.getByRole("button", { name: "업데이트" }));

    await waitFor(async () => {
      expect((await listVersions("pg2"))[0].changeNote).toBe("머리말 정리");
    });
  });

  /**
   * 직전 비교에 고정돼 있던 한계를 닫은 것이 W22였다 — 화면이 표로 바뀐 뒤에도 "3주 전 그
   * 상태와 지금"을 고를 수 있어야 한다. 이제 그 선택이 주소에 남는다.
   */
  it("표에서 임의의 두 버전을 골라 견줄 수 있다", async () => {
    const user = userEvent.setup();
    await updatePage("pg2", { body: "두 번째" });
    await updatePage("pg2", { body: "세 번째" });
    renderApp("/spaces/sp1/pages/pg2");
    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });

    await user.click(screen.getByRole("button", { name: "히스토리" }));
    await screen.findByRole("heading", { level: 1, name: "페이지 히스토리" });

    // 직전(v. 2↔v. 3)이 아니라 첫 버전과 최신을 고른다
    await user.click(screen.getByRole("checkbox", { name: "v. 1 선택" }));
    await user.click(screen.getByRole("checkbox", { name: "v. 3 선택" }));
    await user.click(screen.getByRole("button", { name: "선택한 버전 비교" }));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/spaces/sp1/pages/pg2/history/compare?from=1&to=3",
      );
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "v. 1 ↔ v. 3 비교" }),
    ).toBeInTheDocument();
    const diff = await screen.findByTestId("diff-view");
    expect(within(diff).getByText("세 번째")).toHaveClass("diff-added");
  });
});
