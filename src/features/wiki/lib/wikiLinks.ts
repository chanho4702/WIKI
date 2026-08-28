
/**
 * `[[제목]]` 해석에 필요한 최소 정보(2026-08-28). Page도 PageNode도 이 모양을 만족한다 —
 * 링크 판별·자동완성은 제목과 id만 있으면 되므로 화면이 전체 Page를 들고 있을 이유가 없다.
 */
export interface WikiLinkTarget {
  id: string;
  title: string;
}

/** 코드 펜스(```)와 인라인 코드(`)를 분리해 코드 밖에서만 치환하기 위한 분할 패턴 */
const CODE_SPLIT = /(```[\s\S]*?```|`[^`\n]*`)/;

/** [[ ]] 패턴 소스 상수 — 닫힌 wiki link [[제목]] 매칭 */
export const WIKI_LINK_SOURCE = "\\[\\[([^\\[\\]\\n]+)\\]\\]";

/** [[ ]] 패턴 소스 상수 — 닫히지 않은 wiki link 런 [[... 매칭 (줄 끝 앵커 $) */
export const WIKI_LINK_OPEN_SOURCE = "\\[\\[[^\\[\\]\\n]*$";

/**
 * 생성 링크의 title 쿼리 인코딩 — encodeURIComponent가 남기는 괄호까지 이스케이프한다.
 * 짝이 안 맞는 괄호가 마크다운 링크 목적지를 조기 종료시키는 것을 방지 (CommonMark).
 */
function encodeTitleParam(title: string): string {
  return encodeURIComponent(title).replace(/\(/g, "%28").replace(/\)/g, "%29");
}

/**
 * [[제목]] → 마크다운 링크 치환.
 *
 * 대상은 **제목 → 페이지 id 맵**이다(2026-08-28). 예전에는 스페이스의 전 페이지 배열을 받아
 * 여기서 제목 색인을 만들었는데, 그러려면 화면이 스페이스 전량을 들고 있어야 했다.
 * 이제 본문에 실제로 나온 제목만 서버에 물어 그 결과를 넘긴다.
 *
 * 없는 제목은 생성 화면 경로(new?title=) — MarkdownView가 danger 스타일을 입힌다.
 * 아직 조회가 끝나지 않았으면(맵이 비었으면) 없는 것과 같게 그린다 — 잘못된 링크로 보내는
 * 것보다 "만들기"로 보이는 편이 낫고, 조회가 끝나면 즉시 정상 링크로 바뀐다.
 */
export function resolveWikiLinks(
  markdown: string,
  targets: ReadonlyMap<string, string>,
  spaceId: string,
): string {
  const wikiLinkRegex = new RegExp(WIKI_LINK_SOURCE, "g");
  return markdown
    .split(CODE_SPLIT)
    .map((segment, index) => {
      if (index % 2 === 1) return segment; // 홀수 인덱스 = 코드 구간
      return segment.replace(wikiLinkRegex, (_match, raw: string) => {
        const title = raw.trim();
        const targetId = targets.get(normalizeWikiTitle(title));
        return targetId
          ? `[${title}](/spaces/${spaceId}/pages/${targetId})`
          : `[${title}](/spaces/${spaceId}/pages/new?title=${encodeTitleParam(title)})`;
      });
    })
    .join("");
}

/** 제목 대조 기준 — 백엔드 PageLink.normalizeTitle과 같다(trim + 소문자). */
export function normalizeWikiTitle(title: string): string {
  return title.trim().toLowerCase();
}

/** 본문에 실제로 등장하는 `[[제목]]` 목록. 코드 구간은 링크가 아니다. */
export function extractWikiLinkTitles(markdown: string): string[] {
  const wikiLinkRegex = new RegExp(WIKI_LINK_SOURCE, "g");
  const found = new Set<string>();
  markdown.split(CODE_SPLIT).forEach((segment, index) => {
    if (index % 2 === 1) return;
    for (const match of segment.matchAll(wikiLinkRegex)) {
      const title = match[1].trim();
      if (title) found.add(title);
    }
  });
  return [...found];
}
