/**
 * 스켈레톤 로딩 프리미티브 — 스피너 대신 콘텐츠 자리를 미리 잡는다(레이아웃 점프 방지 +
 * 무엇이 로드되는지 형태로 예고). PageViewPage의 기존 스켈레톤과 같은 `.wiki-skeleton`
 * 펄스를 재사용하며, 진행 상태는 시각 장식(aria-hidden)이 아니라 role=status 문구가 알린다.
 */

export function SkeletonLines({ label, widths }: { label: string; widths: string[] }) {
  return (
    <div className="wiki-skeleton-group">
      <span className="wiki-visually-hidden" role="status">
        {label}
      </span>
      <div aria-hidden="true" className="wiki-skeleton-lines">
        {widths.map((width, i) => (
          <span key={i} className="wiki-skeleton wiki-skeleton-line" style={{ width }} />
        ))}
      </div>
    </div>
  );
}

/** 사이드바 페이지 트리 자리 — 들여쓰기 섞인 행들로 트리 형태를 예고한다. */
export function TreeSkeleton({ label }: { label: string }) {
  const rows = [0, 1, 1, 0, 1, 2];
  return (
    <div className="wiki-skeleton-group">
      <span className="wiki-visually-hidden" role="status">
        {label}
      </span>
      <div aria-hidden="true" className="wiki-skeleton-tree">
        {rows.map((depth, i) => (
          <span
            key={i}
            className="wiki-skeleton wiki-skeleton-line"
            style={{ marginLeft: `${depth * 16}px`, width: `${72 - depth * 14 - (i % 3) * 8}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** 댓글 자리 — 아바타 원 + 이름/본문 줄 형태. */
export function CommentSkeleton({ label, count = 2 }: { label: string; count?: number }) {
  return (
    <div className="wiki-skeleton-group">
      <span className="wiki-visually-hidden" role="status">
        {label}
      </span>
      <div aria-hidden="true" className="wiki-skeleton-comments">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="wiki-skeleton-comment">
            <span className="wiki-skeleton wiki-skeleton-circle" />
            <div className="wiki-skeleton-lines">
              <span className="wiki-skeleton wiki-skeleton-line" style={{ width: "120px" }} />
              <span className="wiki-skeleton wiki-skeleton-line" style={{ width: i % 2 ? "60%" : "85%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
