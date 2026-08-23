/**
 * 이미지 표시 폭 — src의 `#w=<px>` 프래그먼트에 싣는다.
 *
 * 왜 프래그먼트인가: 폭은 마크다운 표준으로 표현할 수 없다(`![alt](src)`뿐). 별도 확장
 * 문법(`{width=}`)을 만들면 편집(markdown-it)·보기(remark) 파서를 또 갈라야 하지만,
 * 프래그먼트는 **URL의 일부라 표준 이미지 문법 그대로 왕복**된다 — 직렬화 코드 변경이 없고,
 * 이 문법을 모르는 렌더러에서도 이미지가 그대로 보인다(프래그먼트는 서버로 전송되지 않는다).
 * 캡션은 마크다운 표준 title(`![alt](src "캡션")`)을 그대로 쓴다 — 여기서 다루지 않는다.
 */

/** 본문 폭(760px)을 넘는 값은 의미가 없고, 너무 작으면 리사이즈 핸들을 다시 잡을 수 없다. */
export const IMAGE_MIN_WIDTH = 80;
export const IMAGE_MAX_WIDTH = 760;

const WIDTH_FRAGMENT_RE = /#w=(\d+)$/;

export function clampImageWidth(width: number): number {
  return Math.min(IMAGE_MAX_WIDTH, Math.max(IMAGE_MIN_WIDTH, Math.round(width)));
}

/** src에 실린 표시 폭. 없거나 범위 밖이면 null(원본 크기). */
export function parseImageWidth(src: string): number | null {
  const m = WIDTH_FRAGMENT_RE.exec(src);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value) || value < IMAGE_MIN_WIDTH || value > IMAGE_MAX_WIDTH) return null;
  return value;
}

/** `#w=` 프래그먼트만 걷어낸 실제 로드용 src. 다른 프래그먼트(#anchor 등)는 보존한다. */
export function stripImageWidth(src: string): string {
  return src.replace(WIDTH_FRAGMENT_RE, "");
}

/** 폭을 갱신한 src. null이면 프래그먼트 제거(원본 크기로 복귀). */
export function withImageWidth(src: string, width: number | null): string {
  const base = stripImageWidth(src);
  return width === null ? base : `${base}#w=${clampImageWidth(width)}`;
}
