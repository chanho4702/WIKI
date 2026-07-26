import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";
import type { WikiData } from "../features/wiki/store/types";

/** 시드에 폴더(fd1)와 그 자식 페이지(pgF)를 더한다 — 폴더 화면·트리 구분 검증용. */
function seedWithFolder(): WikiData {
  const data = createSeedData();
  const T = "2026-07-12T09:00:00.000Z";
  data.pages.push(
    {
      id: "fd1",
      spaceId: "sp1",
      parentId: null,
      type: "folder",
      status: "published",
      title: "운영 문서",
      body: "",
      version: 1,
      position: 3,
      createdBy: "u1",
      updatedBy: "u1",
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "pgF",
      spaceId: "sp1",
      parentId: "fd1",
      type: "page",
      status: "published",
      title: "장애 대응 절차",
      body: "# 장애 대응",
      version: 1,
      position: 1,
      createdBy: "u2",
      updatedBy: "u2",
      createdAt: T,
      updatedAt: T,
    },
  );
  return data;
}

beforeEach(() => {
  localStorage.clear();
  __resetForTest();
});

const tree = () => within(screen.getByRole("navigation", { name: "페이지 트리" }));

describe("W12 폴더 콘텐츠 타입", () => {
  it("트리에서 폴더는 폴더임이 접근 이름으로도 드러난다 — 아이콘만으로 구분하지 않는다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(seedWithFolder()));
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    expect(tree().getByRole("link", { name: "운영 문서 (폴더)" })).toBeInTheDocument();
    // 일반 페이지에는 붙지 않는다
    expect(tree().getByRole("link", { name: "시작하기" })).toBeInTheDocument();
  });

  it("트리에서 폴더를 누르면 페이지 보기가 아니라 폴더 화면으로 간다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(seedWithFolder()));
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(tree().getByRole("link", { name: "운영 문서 (폴더)" }));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/folder/fd1");
    });
  });

  it("폴더 화면이 자식 목록을 표로 보여주고, 이름을 누르면 그 페이지로 간다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(seedWithFolder()));
    renderApp("/spaces/sp1/folder/fd1");

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "이름" })).toBeInTheDocument();
    const row = within(table).getByRole("link", { name: "장애 대응 절차" });
    await user.click(row);
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/spaces/sp1/pages/pgF");
    });
  });

  it("빈 폴더는 비어 있음을 알린다 — 빈 표를 보여주지 않는다", async () => {
    const data = seedWithFolder();
    data.pages = data.pages.filter((p) => p.id !== "pgF");
    localStorage.setItem("wiki.v1", JSON.stringify(data));
    renderApp("/spaces/sp1/folder/fd1");

    expect(await screen.findByRole("heading", { name: "이 폴더는 비어 있습니다" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("존재하지 않는 폴더 주소는 안내 화면을 보여준다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(seedWithFolder()));
    renderApp("/spaces/sp1/folder/없는id");
    expect(await screen.findByRole("heading", { name: "폴더를 찾을 수 없습니다" })).toBeInTheDocument();
  });

  it("폴더 주소로 일반 페이지를 열려 해도 폴더 화면을 흉내내지 않는다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(seedWithFolder()));
    renderApp("/spaces/sp1/folder/pg1"); // pg1은 폴더가 아니라 페이지
    expect(await screen.findByRole("heading", { name: "폴더를 찾을 수 없습니다" })).toBeInTheDocument();
  });

  it("헤더 '만들기 → 폴더'로 폴더를 만들면 폴더 화면으로 이동하고 트리에 나타난다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "만들기" }));
    await user.click(await screen.findByRole("menuitem", { name: "폴더" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(/^\/spaces\/sp1\/folder\/.+/);
    });
    expect(await within(await screen.findByRole("navigation", { name: "페이지 트리" })).findByRole(
      "link",
      { name: "제목 없는 폴더 (폴더)" },
    )).toBeInTheDocument();
  });

  it("폴더 이름을 인라인으로 고치면 트리에도 반영된다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(seedWithFolder()));
    renderApp("/spaces/sp1/folder/fd1");
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "폴더 이름 편집" }));
    const input = screen.getByRole("textbox", { name: "폴더 이름" });
    await user.clear(input);
    await user.type(input, "인프라 문서{Enter}");

    await waitFor(() => {
      expect(tree().getByRole("link", { name: "인프라 문서 (폴더)" })).toBeInTheDocument();
    });
  });

  it("폴더 행에는 편집 링크가 없다 — 폴더는 본문이 없다", async () => {
    const data = seedWithFolder();
    // fd1 안에 하위 폴더를 하나 더 둔다
    data.pages.push({
      id: "fd2", spaceId: "sp1", parentId: "fd1", type: "folder", status: "published", title: "런북",
      body: "", version: 1, position: 2, createdBy: "u1", updatedBy: "u1",
      createdAt: "2026-07-12T09:00:00.000Z", updatedAt: "2026-07-12T09:00:00.000Z",
    });
    localStorage.setItem("wiki.v1", JSON.stringify(data));
    renderApp("/spaces/sp1/folder/fd1");

    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    // 헤더 + 자식 2행
    expect(rows).toHaveLength(3);
    // 페이지 행에는 편집 링크가 있고, 폴더 행에는 없다
    expect(within(table).getAllByRole("link", { name: "편집" })).toHaveLength(1);
  });
});

describe("W12 편집 화면 저장 상태", () => {
  it("처음에는 저장됨, 제목을 고치면 저장되지 않은 변경으로 바뀐다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1/pages/pg1/edit");

    const title = await screen.findByRole("textbox", { name: "페이지 제목" });
    expect(screen.getByText("저장됨")).toBeInTheDocument();

    await user.type(title, " 개정");
    expect(await screen.findByText("저장되지 않은 변경")).toBeInTheDocument();
  });
});

describe("W12 초안 만들기 → 게시", () => {
  it("사이드바 '+'는 초안을 즉시 만들고 편집 화면을 연다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "초안 만들기" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(
        /^\/spaces\/sp1\/pages\/.+\/edit$/,
      );
    });
  });

  it("초안은 트리에 '초안' 배지와 함께 바로 나타난다 — 저장 전에도 보인다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });

    await user.click(screen.getByRole("button", { name: "초안 만들기" }));

    // 배지는 링크의 접근 이름에 포함된다 — 시각 배지와 스크린리더 안내가 갈리지 않게
    await waitFor(() => {
      expect(tree().getByRole("link", { name: "제목 없음 초안" })).toBeInTheDocument();
    });
  });

  it("초안 편집 화면의 주 액션은 '업데이트'가 아니라 '게시'다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "초안 만들기" }));

    expect(await screen.findByRole("button", { name: "게시" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "업데이트" })).not.toBeInTheDocument();
    expect(screen.getByText("초안 — 아직 게시되지 않음")).toBeInTheDocument();
  });

  it("게시하면 보기 화면으로 가고 트리의 '초안' 배지가 사라진다", async () => {
    const user = userEvent.setup();
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1");
    await screen.findByRole("navigation", { name: "페이지 트리" });
    await user.click(screen.getByRole("button", { name: "초안 만들기" }));

    const title = await screen.findByRole("textbox", { name: "페이지 제목" });
    await user.clear(title);
    await user.type(title, "배포 체크리스트");
    await user.click(screen.getByRole("button", { name: "게시" }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toMatch(/^\/spaces\/sp1\/pages\/[^/]+$/);
    });
    await waitFor(() => {
      expect(tree().getByRole("link", { name: "배포 체크리스트" })).toBeInTheDocument();
    });
    // 배지가 남아 있으면 접근 이름에 "초안"이 포함된다
    expect(tree().queryByRole("link", { name: /초안/ })).not.toBeInTheDocument();
  });

  it("이미 게시된 문서를 다시 편집하면 '업데이트'로 되돌아온다", async () => {
    localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
    renderApp("/spaces/sp1/pages/pg1/edit");
    expect(await screen.findByRole("button", { name: "업데이트" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "게시" })).not.toBeInTheDocument();
  });
});
