import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { EmptyState } from "@chanho/react";
import { FileText, Folder, Tag } from "lucide-react";
import type { LabelCount, Page } from "../store/types";
import { listPagesWithLabel, listSpaceLabels } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { contentPathIn } from "../lib/contentPath";

/**
 * 라벨 탐색 (`/spaces/:spaceId/labels`, `/spaces/:spaceId/labels/:name`).
 * 컨플루언스의 "라벨로 찾아보기"에 해당한다 — 트리로는 못 찾는 가로 분류를 여는 화면.
 */
export function LabelsPage() {
  const { spaceId, name } = useParams();
  const { space } = useOutletContext<WikiOutletContext>();
  const [labels, setLabels] = useState<LabelCount[] | null>(null);
  const [pages, setPages] = useState<Page[] | null>(null);

  useEffect(() => {
    if (!spaceId) return;
    void listSpaceLabels(spaceId).then(setLabels);
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId || !name) {
      setPages(null);
      return;
    }
    void listPagesWithLabel(spaceId, name).then(setPages);
  }, [spaceId, name]);

  return (
    <div className="labels-page">
      <header>
        <h1 className="labels-page-title">라벨</h1>
        <p className="labels-page-desc">{space.name}에서 사용 중인 라벨입니다.</p>
      </header>

      {labels === null ? (
        <span role="status">라벨 로딩 중</span>
      ) : labels.length === 0 ? (
        <EmptyState
          title="아직 라벨이 없습니다"
          description="페이지 아래 '라벨 추가'로 문서를 분류할 수 있습니다."
        />
      ) : (
        <ul className="labels-cloud">
          {labels.map((label) => (
            <li key={label.name}>
              <Link
                to={`/spaces/${spaceId}/labels/${encodeURIComponent(label.name)}`}
                className={label.name === name ? "label-chip label-chip-active" : "label-chip"}
                aria-current={label.name === name ? "page" : undefined}
              >
                <Tag size={12} aria-hidden="true" />
                {label.name}
                <span className="label-chip-count">{label.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {name ? (
        <section aria-label={`${name} 라벨이 붙은 문서`}>
          <h2 className="labels-page-subtitle">{name}</h2>
          {pages === null ? (
            <span role="status">문서 로딩 중</span>
          ) : pages.length === 0 ? (
            <EmptyState title="이 라벨이 붙은 문서가 없습니다" />
          ) : (
            <ul className="labels-results">
              {pages.map((page) => (
                <li key={page.id}>
                  <Link to={contentPathIn(spaceId ?? "", page)}>
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
          )}
        </section>
      ) : null}
    </div>
  );
}
