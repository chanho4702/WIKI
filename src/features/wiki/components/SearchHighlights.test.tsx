import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SearchHighlights } from "./SearchHighlights";

describe("SearchHighlights", () => {
  it("em만 mark로 바꾸고 나머지 HTML 모양 문자열은 텍스트로 렌더한다", () => {
    const { container } = render(
      <SearchHighlights highlights={["앞 <em>검색어</em> <img src=x onerror=alert(1)> 뒤"]} />,
    );

    expect(screen.getByText("검색어").tagName).toBe("MARK");
    expect(container.querySelector("img")).toBeNull();
    expect(container).toHaveTextContent("<img src=x onerror=alert(1)>");
  });
});
