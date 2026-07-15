import { lineDiff } from "../lib/lineDiff";

export interface DiffViewProps {
  oldText: string;
  newText: string;
}

/** 라인 diff 표시 — +/- 마커는 CSS ::before로 붙여 텍스트 매칭(테스트)을 깨지 않는다. */
export function DiffView({ oldText, newText }: DiffViewProps) {
  const lines = lineDiff(oldText, newText);
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
