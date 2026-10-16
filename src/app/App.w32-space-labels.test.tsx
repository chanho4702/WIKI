import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, listSpaces, setSpaceLabels } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

/**
 * 스페이스 라벨(V41) — 디렉토리의 "라벨" 열·필터와 스페이스 설정의 편집.
 * 문서 라벨과 다른 원장이라는 것, 빈 상태, 주소(?label=)로 공유되는 필터를 고정한다.
 */
function seedTwoSpaces(labels: { sp1?: string[]; sp2?: string[] } = {}) {
  const data = createSeedData();
  const sp1 = data.spaces.find((s) => s.id === "sp1");
  if (sp1 && labels.sp1) sp1.labels = labels.sp1;
  data.spaces.push({
    id: "sp2",
    key: "OPS",
    name: "운영 위키",
    createdAt: "2026-07-11T00:00:00.000Z",
    ...(labels.sp2 ? { labels: labels.sp2 } : {}),
  });
  localStorage.setItem("wiki.v1", JSON.stringify(data));
  __resetForTest();
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

describe("스페이스 디렉토리 — 라벨 열과 필터", () => {
  it("라벨을 칩으로 보이고, 칩을 누르면 그 라벨의 스페이스만 남는다(주소에 남는다)", async () => {
    const user = userEvent.setup();
    seedTwoSpaces({ sp1: ["runbook", "engineering"], sp2: ["ops"] });
    renderApp("/spaces");

    const section = await screen.findByRole("region", { name: "모든 스페이스" });
    const devLabels = within(section).getByRole("list", { name: "개발 위키 라벨" });
    // 이름순(코드유닛) — 저장 순서가 아니다
    expect(within(devLabels).getAllByRole("button").map((b) => b.textContent)).toEqual(["engineering", "runbook"]);

    await user.click(within(section).getByRole("button", { name: "라벨 ops로 거르기" }));
    await waitFor(() =>
      expect(within(section).queryByRole("button", { name: "개발 위키 (DEV)" })).not.toBeInTheDocument(),
    );
    expect(within(section).getByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("label=ops");
    expect(within(section).getByRole("button", { name: "라벨 ops로 거르기" })).toHaveAttribute("aria-pressed", "true");

    // 다시 누르면 풀린다
    await user.click(within(section).getByRole("button", { name: "라벨 ops로 거르기" }));
    expect(await within(section).findByRole("button", { name: "개발 위키 (DEV)" })).toBeInTheDocument();
  });

  it("주소의 라벨에 맞는 스페이스가 없으면 빈 상태와 필터 지우기를 준다", async () => {
    const user = userEvent.setup();
    seedTwoSpaces({ sp1: ["engineering"] });
    renderApp("/spaces?label=없는-라벨");

    expect(await screen.findByRole("heading", { name: "이 라벨의 스페이스가 없습니다" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "라벨 필터 지우기" }));
    expect(await screen.findByRole("button", { name: "운영 위키 (OPS)" })).toBeInTheDocument();
  });

  it("라벨이 하나도 없으면 라벨 칸은 '—'이고 고를 것 없는 라벨 셀렉트를 두지 않는다", async () => {
    seedTwoSpaces();
    renderApp("/spaces");
    const section = await screen.findByRole("region", { name: "모든 스페이스" });
    expect(within(section).queryByRole("list", { name: /라벨$/ })).not.toBeInTheDocument();
    expect(within(section).queryByLabelText("라벨")).not.toBeInTheDocument();
    expect(within(section).getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("스페이스 설정 — 라벨 편집", () => {
  it("쉼표로 여러 개를 붙이면 정규화되고, 디렉토리에 바로 반영된다", async () => {
    const user = userEvent.setup();
    seedTwoSpaces();
    renderApp("/spaces/sp1/settings");

    const editor = await screen.findByRole("region", { name: "스페이스 라벨" });
    expect(within(editor).getByText("아직 라벨이 없습니다.")).toBeInTheDocument();
    await user.type(within(editor).getByLabelText("스페이스 라벨 추가"), "Design Docs, runbook");
    await user.click(within(editor).getByRole("button", { name: "추가" }));

    expect(await within(editor).findByText("design-docs")).toBeInTheDocument();
    expect(within(editor).getByText("runbook")).toBeInTheDocument();
    expect((await listSpaces()).find((s) => s.id === "sp1")?.labels).toEqual(["design-docs", "runbook"]);

    await user.click(within(editor).getByRole("button", { name: "스페이스 라벨 runbook 제거" }));
    await waitFor(() => expect(within(editor).queryByText("runbook")).not.toBeInTheDocument());
    expect((await listSpaces()).find((s) => s.id === "sp1")?.labels).toEqual(["design-docs"]);
  });

  it("라벨을 바꿔도 저장 전인 이름·설명 초안은 남는다", async () => {
    const user = userEvent.setup();
    seedTwoSpaces();
    renderApp("/spaces/sp1/settings");
    const editor = await screen.findByRole("region", { name: "스페이스 라벨" });
    const nameField = screen.getByLabelText("이름");
    await user.clear(nameField);
    await user.type(nameField, "고치는 중인 이름");

    await user.type(within(editor).getByLabelText("스페이스 라벨 추가"), "ops");
    await user.click(within(editor).getByRole("button", { name: "추가" }));
    await within(editor).findByText("ops");

    expect(screen.getByLabelText("이름")).toHaveValue("고치는 중인 이름");
  });

  it("상한을 넘기면 서버(목업) 문구를 그대로 보여 주고 저장하지 않는다", async () => {
    const user = userEvent.setup();
    seedTwoSpaces();
    renderApp("/spaces/sp1/settings");
    const editor = await screen.findByRole("region", { name: "스페이스 라벨" });

    await user.type(
      within(editor).getByLabelText("스페이스 라벨 추가"),
      Array.from({ length: 11 }, (_, i) => `l${i}`).join(","),
    );
    await user.click(within(editor).getByRole("button", { name: "추가" }));
    expect(await screen.findByText("스페이스 라벨은 10개까지입니다")).toBeInTheDocument();
    expect((await listSpaces()).find((s) => s.id === "sp1")?.labels).toEqual([]);
  });
});

describe("스페이스 라벨 — 스토어 계약(목업)", () => {
  it("전량 교체·정규화·중복 접기·이름순이고 문서 라벨과 섞이지 않는다", async () => {
    seedTwoSpaces();
    const saved = await setSpaceLabels("sp1", [" Zeta ", "alpha", "ALPHA", "two words"]);
    expect(saved.labels).toEqual(["alpha", "two-words", "zeta"]);
    expect((await listSpaces()).find((s) => s.id === "sp2")?.labels).toEqual([]);
    await expect(setSpaceLabels("sp1", ["  "])).rejects.toThrow("라벨을 입력하세요");
    await expect(setSpaceLabels("nope", ["a"])).rejects.toThrow("스페이스를 찾을 수 없습니다");
  });
});
