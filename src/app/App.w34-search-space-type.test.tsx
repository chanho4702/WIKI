import { beforeEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderApp } from "./testUtils";
import { __resetForTest, createPage, createSpace, searchContent } from "../features/wiki/store/wikiStore";
import { createSeedData } from "../mock/seed";

/*
 * F-01 — 검색의 스페이스·종류 필터. 계약(`spaceIds`·`docTypes`)은 이미 있었는데 화면이 넘기지 않았다.
 */

let otherSpaceId = "";

beforeEach(async () => {
  localStorage.clear();
  __resetForTest();
  localStorage.setItem("wiki.v1", JSON.stringify(createSeedData()));
  const other = await createSpace({ key: "OPS", name: "운영 위키" });
  otherSpaceId = other.id;
  await createPage({ spaceId: "sp1", title: "공통어휘 개발 문서", body: "본문" });
  await createPage({ spaceId: other.id, title: "공통어휘 운영 문서", body: "본문" });
});

const resultTitles = async () => {
  const list = await screen.findByRole("list", { name: /검색 결과/ });
  return within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
};

describe("F-01 검색 스페이스·종류 필터", () => {
  it("스페이스를 고르면 그 스페이스 결과만 나오고 URL에 남아 새로고침해도 유지된다", async () => {
    const user = userEvent.setup();
    const view = renderApp("/search?q=공통어휘");
    await waitFor(async () => expect(await resultTitles()).toHaveLength(2));

    await user.click(screen.getByLabelText("스페이스"));
    await user.click(await screen.findByRole("option", { name: "운영 위키" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`space=${otherSpaceId}`));
    await waitFor(async () => {
      const titles = await resultTitles();
      expect(titles).toHaveLength(1);
      expect(titles[0]).toContain("공통어휘 운영 문서");
    });

    // 새로고침 = 같은 URL로 다시 렌더
    const url = screen.getByTestId("location").textContent!;
    view.unmount();
    renderApp(url);
    await waitFor(async () => {
      const titles = await resultTitles();
      expect(titles).toHaveLength(1);
      expect(titles[0]).toContain("공통어휘 운영 문서");
    });
    expect(screen.getByLabelText("스페이스")).toHaveTextContent("운영 위키");
  });

  it("종류를 '첨부파일'로 고르면 문서 결과가 빠지고 URL에 type이 남는다", async () => {
    const user = userEvent.setup();
    renderApp("/search?q=공통어휘");
    await waitFor(async () => expect(await resultTitles()).toHaveLength(2));

    await user.click(screen.getByLabelText("종류"));
    await user.click(await screen.findByRole("option", { name: "첨부파일" }));

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("type=ATTACHMENT"));
    expect(await screen.findByRole("heading", { name: /검색 결과가 없습니다|결과가 없습니다/ })).toBeInTheDocument();
  });

  it("스페이스 화면에서 상단 검색을 하면 그 스페이스가 미리 선택돼 있다", async () => {
    const user = userEvent.setup();
    renderApp(`/spaces/${otherSpaceId}`);
    const field = await screen.findByLabelText("전역 검색");

    await user.type(field, "공통어휘{Enter}");

    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`space=${otherSpaceId}`));
    await waitFor(async () => {
      const titles = await resultTitles();
      expect(titles).toHaveLength(1);
      expect(titles[0]).toContain("공통어휘 운영 문서");
    });
  });

  it("스토어 계약: spaceIds·docTypes를 넘기면 그 범위만 준다", async () => {
    const scoped = await searchContent({ query: "공통어휘", spaceIds: [otherSpaceId] });
    expect(scoped.hits.map((h) => h.spaceId)).toEqual([otherSpaceId]);
    const attachmentsOnly = await searchContent({ query: "공통어휘", docTypes: ["ATTACHMENT"] });
    expect(attachmentsOnly.hits.filter((h) => h.docType === "PAGE")).toEqual([]);
  });
});
