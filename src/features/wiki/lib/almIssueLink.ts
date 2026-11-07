// ALM 이슈 링크 인식 — 위키↔ALM 스마트 링크(W3, 설계 2026-11-08 §4.4)의 단일 규칙.
// 보기 렌더(MarkdownView)·키 수집·슬래시 삽입이 모두 이 파일만 본다.

/**
 * ALM 이슈 키 — alm-backend 카드 조회(`GET /api/alm/issues/cards`)의 입력 검증과 같은 정규식이다.
 * 프로젝트 키 규칙(`[A-Za-z][A-Za-z0-9_-]{1,11}`, ProjectCreateRequest) + 1~9자리 번호.
 * 양쪽이 갈리면 오류가 아니라 "조용히 일반 링크"로 나타난다 — 바꿀 때는 백엔드와 같이 바꾼다.
 */
export const ALM_ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9_-]{1,11}-[0-9]{1,9}$/;

/** 대소문자·공백을 정규화한 키, 형식이 아니면 null. */
export function normalizeAlmIssueKey(raw: string | null | undefined): string | null {
  const key = (raw ?? "").trim().toUpperCase();
  return ALM_ISSUE_KEY_PATTERN.test(key) ? key : null;
}

/** 키 하나로 여는 정규 주소 — alm-front `/alm/browse/:key`(Jira `/browse/KEY` 선례). 같은 오리진 상대 경로다. */
export function almIssueHref(key: string): string {
  return `/alm/browse/${key}`;
}

const BROWSE_PATH = /^\/alm\/browse\/([^/]+)\/?$/;
const ISSUES_PATH = /^\/alm\/projects\/\d+\/issues\/?$/;

/**
 * href가 ALM 이슈를 가리키면 `{ key }`. 두 주소 형태를 받는다.
 *
 * - `/alm/browse/{KEY}` — alm-front가 링크 복사로 내는 정규 주소
 * - `/alm/projects/{n}/issues?issue={KEY}` — 이슈 상세 모달 주소(예전 링크 복사·주소창 복사)
 *
 * 절대 URL이면 **호스트는 보지 않고 경로만 본다**(설계 §4.4) — 위키와 ALM이 다른 호스트명으로
 * 불리는 설치(내부/외부 주소)에서도 같은 이슈로 읽혀야 한다. http(s)가 아닌 스킴은 받지 않는다.
 */
export function almIssueLink(href: string | null | undefined): { key: string } | null {
  if (!href || !href.includes("/alm/")) return null;
  let url: URL;
  try {
    url = new URL(href, "http://wiki.invalid");
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const browse = BROWSE_PATH.exec(url.pathname);
  if (browse) {
    let segment: string;
    try {
      segment = decodeURIComponent(browse[1]);
    } catch {
      return null;
    }
    const key = normalizeAlmIssueKey(segment);
    return key ? { key } : null;
  }
  if (ISSUES_PATH.test(url.pathname)) {
    const key = normalizeAlmIssueKey(url.searchParams.get("issue"));
    return key ? { key } : null;
  }
  return null;
}

/** 본문에서 `/alm/`을 품은 URL 후보 토큰 — 마크다운 링크 `(...)`·자동 링크 `<...>`·맨 URL 모두. */
const URL_CANDIDATE = /[^\s()<>[\]"'`]*\/alm\/[^\s()<>[\]"'`]*/g;

/**
 * 본문 마크다운에 나오는 ALM 이슈 키를 모은다(중복 제거, 등장 순). 화면은 이 목록으로 카드를
 * **한 번에** 조회한다 — 링크마다 조회하면 요청 폭포가 된다(react-performance).
 *
 * 링크가 아닌 자리(코드 블록 안의 URL 등)의 키가 섞여도 해가 없다 — 조회만 한 번 더 넓어질 뿐,
 * 스마트 링크로 그려지는 것은 실제 링크(`a`)뿐이다.
 */
export function collectAlmIssueKeys(markdown: string): string[] {
  if (!markdown.includes("/alm/")) return [];
  const keys = new Set<string>();
  for (const token of markdown.match(URL_CANDIDATE) ?? []) {
    const hit = almIssueLink(token);
    if (hit) keys.add(hit.key);
  }
  return [...keys];
}
