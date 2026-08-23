import { describe, expect, it } from "vitest";
import { parseImageWidth, stripImageWidth, withImageWidth } from "./imageAttrs";

describe("imageAttrs — `#w=` 표시 폭 프래그먼트", () => {
  it("폭을 읽고/걷어내고/갱신한다", () => {
    const src = "/api/wiki/attachments/7/inline#w=480";
    expect(parseImageWidth(src)).toBe(480);
    expect(stripImageWidth(src)).toBe("/api/wiki/attachments/7/inline");
    expect(withImageWidth("/api/wiki/attachments/7/inline", 320)).toBe(
      "/api/wiki/attachments/7/inline#w=320",
    );
    expect(withImageWidth(src, null)).toBe("/api/wiki/attachments/7/inline");
  });

  it("범위 밖 값은 clamp된다 — 문서에 본문 폭보다 큰 값이 저장되지 않는다", () => {
    expect(withImageWidth("a.png", 5000)).toBe("a.png#w=760");
    expect(withImageWidth("a.png", 10)).toBe("a.png#w=80");
    expect(parseImageWidth("a.png#w=99999")).toBeNull();
  });

  it("다른 프래그먼트(#anchor)는 폭으로 오인하지도, 지우지도 않는다", () => {
    expect(parseImageWidth("https://example.com/img.svg#icon")).toBeNull();
    expect(stripImageWidth("https://example.com/img.svg#icon")).toBe(
      "https://example.com/img.svg#icon",
    );
    expect(withImageWidth("https://example.com/img.svg#icon", 200)).toBe(
      "https://example.com/img.svg#icon#w=200",
    );
  });
});
