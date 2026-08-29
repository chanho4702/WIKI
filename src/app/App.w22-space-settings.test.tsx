import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, listSpaceGrants, listSpaces } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
});

/**
 * 스페이스 설정(W22).
 *
 * 이전에는 백엔드에 이름 변경·삭제 API가 있는데도 화면 진입점이 아예 없었다 —
 * 한번 만든 스페이스는 이름도 못 고치고 지울 수도 없었다.
 */
describe("W22 스페이스 설정", () => {
  it("사이드바에서 설정으로 들어가 이름을 바꾼다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("link", { name: "스페이스 설정" }));
    const nameField = await screen.findByLabelText("이름");
    await user.clear(nameField);
    await user.type(nameField, "개발 위키 2팀");
    await user.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(async () => {
      expect((await listSpaces()).find((s) => s.id === "sp1")?.name).toBe("개발 위키 2팀");
    });
  });

  it("권한 탭에서 사용자를 추가하고 회수한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/settings");
    await screen.findByRole("heading", { level: 1, name: "스페이스 설정" });

    await user.click(screen.getByRole("tab", { name: "권한" }));
    expect(await screen.findByRole("heading", { name: "지정된 권한이 없습니다" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("대상"), "u2");
    await user.selectOptions(screen.getByLabelText("역할"), "editor");
    await user.click(screen.getByRole("button", { name: "추가" }));

    const row = await screen.findByRole("row", { name: /편집/ });
    expect(within(row).getByText("사용자")).toBeInTheDocument();
    expect(await listSpaceGrants("sp1")).toHaveLength(1);

    await user.click(within(row).getByRole("button", { name: /권한 회수/ }));
    await waitFor(async () => {
      expect(await listSpaceGrants("sp1")).toHaveLength(0);
    });
  });

  it("같은 대상을 두 번 추가하면 거부한다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/settings");
    await screen.findByRole("heading", { level: 1, name: "스페이스 설정" });
    await user.click(screen.getByRole("tab", { name: "권한" }));

    await user.selectOptions(await screen.findByLabelText("대상"), "u2");
    await user.click(screen.getByRole("button", { name: "추가" }));
    await screen.findByRole("row", { name: /보기/ });

    await user.selectOptions(screen.getByLabelText("대상"), "u2");
    await user.click(screen.getByRole("button", { name: "추가" }));

    expect(await screen.findByText("이미 권한이 있는 대상입니다")).toBeInTheDocument();
    expect(await listSpaceGrants("sp1")).toHaveLength(1);
  });

  /** 되돌릴 수 없는 동작이라 확인을 한 번 받는다. */
  it("삭제는 확인 후에만 실행되고 스페이스 목록으로 나간다", async () => {
    const user = userEvent.setup();
    renderApp("/spaces/sp1/settings");
    await screen.findByRole("heading", { level: 1, name: "스페이스 설정" });

    await user.click(screen.getByRole("tab", { name: "삭제" }));
    await user.click(await screen.findByRole("button", { name: /스페이스 삭제/ }));

    const dialog = await screen.findByRole("dialog", { name: "스페이스를 삭제할까요?" });
    await user.click(within(dialog).getByRole("button", { name: "삭제" }));

    await waitFor(async () => {
      expect(await listSpaces()).toHaveLength(0);
    });
  });
});
