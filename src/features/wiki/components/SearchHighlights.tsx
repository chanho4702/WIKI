const HIGHLIGHT_TAG = /(<em>|<\/em>)/gi;

function HighlightFragment({ value }: { value: string }) {
  let highlighted = false;
  return value.split(HIGHLIGHT_TAG).map((token, index) => {
    const normalized = token.toLowerCase();
    if (normalized === "<em>") {
      highlighted = true;
      return null;
    }
    if (normalized === "</em>") {
      highlighted = false;
      return null;
    }
    return highlighted ? <mark key={index}>{token}</mark> : <span key={index}>{token}</span>;
  });
}

/** OpenSearch의 `<em>` 두 태그만 React 노드로 해석한다. 나머지 문자열은 항상 텍스트로 렌더된다. */
export function SearchHighlights({ highlights }: { highlights: string[] }) {
  if (highlights.length === 0) return null;
  return (
    <div className="search-result-highlights" aria-label="검색어가 포함된 내용">
      {highlights.slice(0, 3).map((highlight, index) => (
        <p key={`${index}:${highlight}`}>
          <HighlightFragment value={highlight} />
        </p>
      ))}
    </div>
  );
}
