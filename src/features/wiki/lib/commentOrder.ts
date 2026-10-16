import type { Comment } from "../store/types";

/**
 * 댓글 id 비교 — 백엔드 키셋(`created_at, id`)과 같은 순서를 내야 한다.
 *
 * 백엔드 id는 Long이고 어댑터가 문자열로 바꿔 들고 다닌다. 문자열로 비교하면 "100" < "81"이 되어,
 * 같은 시각의 댓글(이관 원본 시각)이 서버 쪽 경계와 다르게 갈려 병합 때 스레드가 빠진다. 둘 다 숫자면
 * 수로, 아니면(목업의 문자열 id) 문자열로 비교한다 — 목업 서버도 이 함수를 쓴다.
 */
export function compareCommentIds(a: string, b: string): number {
  const numeric = /^\d+$/;
  if (numeric.test(a) && numeric.test(b)) {
    // 앞자리 0이 없는 자연수 문자열은 길이가 곧 크기다 — Number로 바꾸면 2^53을 넘는 id가 뭉개진다
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

const UTC_INSTANT = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/;

/**
 * 시각 비교 — 서버(Postgres 마이크로초)와 같은 순서. ISO 문자열을 그대로 비교하면 소수 초 자릿수가 다른
 * 표기(`…00Z`·`…00.001Z`)에서 순서가 뒤집히고, Date로 바꾸면 밀리초 아래가 뭉개진다. UTC 표기는 소수부를
 * 9자리로 채운 키로 비교하고, 그 밖의 표기만 Date로 비교한다.
 */
export function compareInstants(a: string, b: string): number {
  const ma = UTC_INSTANT.exec(a);
  const mb = UTC_INSTANT.exec(b);
  if (ma && mb) {
    const ka = ma[1] + (ma[2] ?? "").padEnd(9, "0");
    const kb = mb[1] + (mb[2] ?? "").padEnd(9, "0");
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }
  const da = Date.parse(a);
  const db = Date.parse(b);
  return da < db ? -1 : da > db ? 1 : 0;
}

/** 작성 시각 오름차순(같으면 id) — 화면에 그리는 순서. */
export function byCreatedAsc(a: Comment, b: Comment): number {
  return compareInstants(a.createdAt, b.createdAt) || compareCommentIds(a.id, b.id);
}
