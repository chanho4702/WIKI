import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { Spinner } from "@chanho/react";
import type { Page } from "../store/types";
import { getPage } from "../store/wikiStore";

export function PageViewPage() {
  const { pageId } = useParams();
  // undefined = 로딩 중, null = 없음
  const [page, setPage] = useState<Page | null | undefined>(undefined);

  useEffect(() => {
    if (!pageId) return;
    setPage(undefined);
    void getPage(pageId).then(setPage);
  }, [pageId]);

  if (page === undefined) {
    return <Spinner label="페이지 로딩 중" />;
  }
  if (page === null) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  return (
    <article className="page-view">
      <h1>{page.title}</h1>
      <p className="page-view-stub">본문 렌더링은 W2에서 구현됩니다.</p>
    </article>
  );
}
