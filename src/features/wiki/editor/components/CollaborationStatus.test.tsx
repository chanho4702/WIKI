import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CollaborationStatus } from "./CollaborationStatus";

const participants = [
  { clientId: 1, id: "1", name: "김찬호", color: "#0c66e4" },
  { clientId: 2, id: "2", name: "Alice Kim", color: "#5e4db2" },
];

describe("CollaborationStatus", () => {
  it("동기화 완료와 참여자 이름을 compact avatar로 알린다", () => {
    render(
      <CollaborationStatus
        status="synced"
        participants={participants}
        onRetry={() => undefined}
      />,
    );
    expect(screen.getByRole("status", { name: "2명 함께 편집 중" })).toBeInTheDocument();
    expect(screen.getByLabelText("현재 참여자: 김찬호, Alice Kim")).toBeInTheDocument();
    expect(screen.getByTitle("김찬호")).toHaveTextContent("김찬");
    expect(screen.getByTitle("Alice Kim")).toHaveTextContent("AK");
  });

  it("연결 실패는 이유와 키보드 접근 가능한 재시도 동작을 제공한다", () => {
    const retry = vi.fn();
    render(
      <CollaborationStatus
        status="error"
        participants={[]}
        error="잠시 후 다시 시도해 주세요."
        onRetry={retry}
      />,
    );
    expect(screen.getByRole("status")).toHaveAccessibleName(
      "공동 편집 연결 실패. 잠시 후 다시 시도해 주세요.",
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 연결" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("비활성 상태는 편집 chrome에 빈 자리를 만들지 않는다", () => {
    const { container } = render(
      <CollaborationStatus status="disabled" participants={[]} onRetry={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
