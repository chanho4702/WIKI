/**
 * 동시 실행 수를 제한한 `Promise.all(items.map(fn))`.
 *
 * 화면이 문서·스페이스 수만큼 요청을 한꺼번에 띄우면 게이트웨이 rate-limit에 걸려 일부가 실패한다
 * (홈 팬아웃·하위 포함 내보내기). 결과 순서는 입력 순서와 같고, 하나라도 실패하면 남은 작업을
 * 새로 시작하지 않고 첫 오류로 거부한다(이미 출발한 요청은 끝까지 간다 — 취소 신호가 없는 호출이다).
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const width = Math.max(1, Math.min(Math.floor(limit), items.length));
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (e) {
        failed = true;
        throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  return results;
}
