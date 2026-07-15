export interface DiffLine {
  kind: "same" | "added" | "removed";
  text: string;
}

/**
 * 라인 단위 diff — LCS(최장 공통 부분열) DP 후 역추적.
 * removed를 added보다 먼저 배출한다(통상 diff 관례).
 */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText === "" ? [] : oldText.split("\n");
  const b = newText === "" ? [] : newText.split("\n");
  const m = a.length;
  const n = b.length;
  // dp[i][j] = a[i..] 와 b[j..] 의 LCS 길이
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({ kind: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ kind: "removed", text: a[i] });
      i++;
    } else {
      result.push({ kind: "added", text: b[j] });
      j++;
    }
  }
  while (i < m) result.push({ kind: "removed", text: a[i++] });
  while (j < n) result.push({ kind: "added", text: b[j++] });
  return result;
}
