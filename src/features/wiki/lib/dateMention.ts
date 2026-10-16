const ISO_DATE_RE = /^date:(\d{4}-\d{2}-\d{2})$/;

/** `date:2026-08-23` href → "2026-08-23". 날짜 요소가 아니면 null. */
export function dateFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return ISO_DATE_RE.exec(href)?.[1] ?? null;
}

/** ISO → 한국어 표시. 파싱 불가한 값은 원문 그대로(데이터를 숨기지 않는다). */
export function formatDateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}
