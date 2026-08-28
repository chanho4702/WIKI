import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import {
  __resetForTest,
  listBacklinks,
  listLabels,
  listPagesWithLabel,
  listSpaceLabels,
  setLabels,
  updatePage,
} from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

describe("W21-2 라벨 — 스토어 계약", () => {
  it("대소문자·공백만 다른 라벨은 하나로 합쳐진다", async () => {
    const saved = await setLabels("pg1", [" Design ", "design", "기획 문서"]);

    expect(saved).toEqual(["design", "기획-문서"]);
    expect(await listLabels("pg1")).toEqual(["design", "기획-문서"]);
  });

  it("스페이스 라벨 목록은 사용 횟수 순이고 라벨로 문서를 찾는다", async () => {
    await setLabels("pg1", ["design", "api"]);
    await setLabels("pg2", ["design"]);

    expect(await listSpaceLabels("sp1")).toEqual([
      { name: "design", count: 2 },
      { name: "api", count: 1 },
    ]);
    expect((await listPagesWithLabel("sp1", "design")).map((p) => p.id).sort()).toEqual([
      "pg1",
      "pg2",
    ]);
  });

  it("빈 배열을 저장하면 라벨이 모두 지워진다", async () => {
    await setLabels("pg1", ["design"]);
    await setLabels("pg1", []);

    expect(await listLabels("pg1")).toEqual([]);
    expect(await listSpaceLabels("sp1")).toEqual([]);
  });
});

describe("W21-2 백링크 — 스토어 계약", () => {
  it("본문의 [[제목]]이 대상의 백링크로 잡히고, 링크를 지우면 사라진다", async () => {
    await updatePage("pg2", { body: "자세한 건 [[시작하기]] 참고" });

    expect((await listBacklinks("pg1")).map((p) => p.id)).toEqual(["pg2"]);

    await updatePage("pg2", { body: "링크 없음" });

    expect(await listBacklinks("pg1")).toEqual([]);
  });

  it("코드 구간의 대괄호는 링크로 잡지 않는다", async () => {
    await updatePage("pg2", { body: "인라인 `[[시작하기]]`\n\n```\n[[시작하기]]\n```" });

    expect(await listBacklinks("pg1")).toEqual([]);
  });

  it("자기 자신을 링크해도 백링크에 넣지 않는다", async () => {
    await updatePage("pg1", { body: "[[시작하기]]" });

    expect(await listBacklinks("pg1")).toEqual([]);
  });
});

describe("W21-2 화면", () => {
  it("페이지에서 라벨을 붙이면 칩으로 보이고 라벨 화면으로 이어진다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/pages/pg1");

    const labelSection = await screen.findByRole("region", { name: "라벨" });
    await user.click(within(labelSection).getByRole("button", { name: "라벨 추가" }));
    await user.type(within(labelSection).getByLabelText("라벨 추가"), "design");
    await user.click(within(labelSection).getByRole("button", { name: "추가" }));

    const chip = await within(labelSection).findByRole("link", { name: "design" });
    await user.click(chip);

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/labels/design");
    });
    expect(await screen.findByRole("region", { name: "design 라벨이 붙은 문서" })).toBeInTheDocument();
  });

  it("백링크가 있으면 본문 아래에 링크한 문서를 보여준다", async () => {
    await updatePage("pg2", { body: "자세한 건 [[시작하기]] 참고" });
    renderApp("/spaces/sp1/pages/pg1");

    const section = await screen.findByRole("region", { name: "이 페이지를 링크한 문서" });
    expect(within(section).getByRole("link", { name: /팀 규칙/ })).toBeInTheDocument();
  });

  it("백링크가 없으면 섹션 자체를 그리지 않는다", async () => {
    renderApp("/spaces/sp1/pages/pg2");

    await screen.findByRole("heading", { level: 1, name: "팀 규칙" });
    expect(screen.queryByRole("region", { name: "이 페이지를 링크한 문서" })).not.toBeInTheDocument();
  });
});
