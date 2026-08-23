import type * as Y from "yjs";

export const COLLABORATION_TITLE_FIELD = "title";
export const COLLABORATION_TITLE_ORIGIN = "wiki-title-input";

/**
 * controlled input 전체 값을 매 키 입력마다 지우고 다시 넣으면 동시 입력이 문자열 두 벌로 갈라진다.
 * 공통 prefix/suffix를 보존하고 실제 변경 구간만 Y.Text operation으로 바꾼다.
 */
export function replaceCollaborativeTitle(title: Y.Text, next: string): void {
  const current = title.toString();
  if (current === next) return;

  const currentPoints = Array.from(current);
  const nextPoints = Array.from(next);
  let prefixPoints = 0;
  while (
    prefixPoints < currentPoints.length
    && prefixPoints < nextPoints.length
    && currentPoints[prefixPoints] === nextPoints[prefixPoints]
  ) prefixPoints += 1;

  let suffixPoints = 0;
  while (
    suffixPoints < currentPoints.length - prefixPoints
    && suffixPoints < nextPoints.length - prefixPoints
    && currentPoints[currentPoints.length - 1 - suffixPoints]
      === nextPoints[nextPoints.length - 1 - suffixPoints]
  ) suffixPoints += 1;

  const prefixLength = currentPoints.slice(0, prefixPoints).join("").length;
  const currentSuffixLength = currentPoints.slice(currentPoints.length - suffixPoints).join("").length;
  const nextSuffixLength = nextPoints.slice(nextPoints.length - suffixPoints).join("").length;
  const deleteLength = current.length - prefixLength - currentSuffixLength;
  const insertion = next.slice(prefixLength, next.length - nextSuffixLength);
  const apply = () => {
    if (deleteLength > 0) title.delete(prefixLength, deleteLength);
    if (insertion) title.insert(prefixLength, insertion);
  };
  if (title.doc) title.doc.transact(apply, COLLABORATION_TITLE_ORIGIN);
  else apply();
}
