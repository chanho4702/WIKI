import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText, Folder, Link2 } from "lucide-react";
import type { Page } from "../store/types";
import { listBacklinks } from "../store/wikiStore";
import { contentPathIn } from "../lib/contentPath";

/**
 * 백링크(W21-2) — "이 페이지를 링크한 문서". 링크가 하나도 없으면 아무것도 그리지 않는다:
 * 대부분의 문서에 빈 섹션이 붙으면 본문 끝이 지저분해진다.
 */
export function Backlinks({ pageId, spaceId }: { pageId: string; spaceId: string }) {
  const [sources, setSources] = useState<Page[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listBacklinks(pageId)
      .then((found) => {
        if (!cancelled) setSources(found);
      })
      .catch(() => {
        if (!cancelled) setSources([]); // 부가 정보라 실패해도 본문을 막지 않는다
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (sources.length === 0) return null;

  return (
    <section className="backlinks" aria-label="이 페이지를 링크한 문서">
      <h2 className="backlinks-title">
        <Link2 size={16} aria-hidden="true" />이 페이지를 링크한 문서 ({sources.length})
      </h2>
      <ul className="backlinks-list">
        {sources.map((page) => (
          <li key={page.id}>
            <Link to={contentPathIn(spaceId, page)}>
              {page.icon ? (
                <span aria-hidden="true">{page.icon}</span>
              ) : page.type === "folder" ? (
                <Folder size={14} aria-hidden="true" />
              ) : (
                <FileText size={14} aria-hidden="true" />
              )}
              {page.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
