import { lineDiff } from "../lib/lineDiff";

export interface DiffViewProps {
  oldText: string;
  newText: string;
}

/** 트레일링 개행 1개 제거 — split("\n")이 만드는 가짜 빈 라인이 diff에 나타나지 않게 한다 */
function stripTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

/** 라인 diff 표시 — +/- 마커는 CSS ::before로 붙여 텍스트 매칭(테스트)을 깨지 않는다. */
export function DiffView({ oldText, newText }: DiffViewProps) {
  const lines = lineDiff(stripTrailingNewline(oldText), stripTrailingNewline(newText));
  if (lines.length === 0) {
    return <p className="diff-empty">내용 없음</p>;
  }
  return (
    <pre className="diff-view" data-testid="diff-view">
      {lines.map((line, index) => (
        <div key={index} className={`diff-line diff-${line.kind}`}>
          {line.text}
        </div>
      ))}
    </pre>
  );
}
