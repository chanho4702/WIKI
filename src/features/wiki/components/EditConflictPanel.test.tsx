import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EditConflictPanel } from "./EditConflictPanel";

function renderPanel(resetCause?: "reset" | "too-large") {
  render(
    <EditConflictPanel
      serverPage={null}
      localTitle="제목"
      localBody="본문"
      comparisonOpen={false}
      variant="collaboration-reset"
      {...(resetCause ? { resetCause } : {})}
      onToggleComparison={vi.fn()}
      onCopyLocal={vi.fn()}
      onCopyServer={vi.fn()}
      onReloadServer={vi.fn()}
      onContinueMerge={vi.fn()}
    />,
  );
}

describe("EditConflictPanel — 공동 편집 멈춤 이유", () => {
  it("리셋이면 다른 경로 저장 안내를 보인다", () => {
    renderPanel();
    expect(screen.getByRole("heading", { name: "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다" }))
      .toBeInTheDocument();
  });

  it("저장 한도 초과면 저장되지 않았다는 사실과 복구 갈래를 보인다(43번 높음-4)", () => {
    renderPanel("too-large");
    expect(screen.getByRole("heading", { name: "문서가 공동 편집 저장 한도를 넘었습니다" })).toBeInTheDocument();
    expect(screen.getByText(/마지막 저장 이후의 공동 편집은 서버에 저장되지 않았습니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "내 변경 복사" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최신 버전 기준으로 공동 편집 다시 시작" })).toBeInTheDocument();
  });
});
