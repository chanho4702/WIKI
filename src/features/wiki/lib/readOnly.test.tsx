import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { READ_ONLY, ReadOnlyProvider, useReadOnly } from "./readOnly";

function Probe() {
  return <div data-testid="read-only">{String(useReadOnly())}</div>;
}

describe("읽기 전용 플래그", () => {
  it("빌드 변수가 없으면 false — 팀 위키 빌드의 기본값이다", () => {
    expect(READ_ONLY).toBe(false);
    render(<Probe />);
    expect(screen.getByTestId("read-only")).toHaveTextContent("false");
  });

  it("provider를 값 없이 감싸도 빌드 기본값을 유지한다", () => {
    render(
      <ReadOnlyProvider>
        <Probe />
      </ReadOnlyProvider>,
    );
    expect(screen.getByTestId("read-only")).toHaveTextContent("false");
  });

  it("provider가 값을 주면 그 값을 쓴다(테스트 주입 통로)", () => {
    render(
      <ReadOnlyProvider value>
        <Probe />
      </ReadOnlyProvider>,
    );
    expect(screen.getByTestId("read-only")).toHaveTextContent("true");
  });
});
