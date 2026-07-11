import { useEffect, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { Avatar, Button, PageHeader, Spinner, useToast } from "@chanho/react";
import type { BreadcrumbItem } from "@chanho/react";
import type { Page, User } from "../store/types";
import { deletePage, getPage, listUsers } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/WikiLayout";
import { MarkdownView } from "../components/MarkdownView";
import { HistoryModal } from "../components/HistoryModal";
import { CommentSection } from "../components/CommentSection";

/** 수정일 표기: 2026-07-10T10:00:00.000Z → "2026년 7월 10일" */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** parentId 체인을 따라 조상 페이지를 루트→직계 부모 순서로 반환. 순환 데이터 방어(방문 집합). */
function ancestorsOf(page: Page, pages: Page[]): Page[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const chain: Page[] = [];
  const visited = new Set<string>([page.id]);
  let parentId = page.parentId;
  while (parentId !== null) {
    if (visited.has(parentId)) break; // 순환 — 무한 루프 방지
    const parent = byId.get(parentId);
    if (!parent) break;
    visited.add(parentId);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

export function PageViewPage() {
  const { spaceId, pageId } = useParams();
  const { pages, space, reloadPages } = useOutletContext<WikiOutletContext>();
  const navigate = useNavigate();
  const toast = useToast();
  // undefined = 로딩 중, null = 없음
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  useEffect(() => {
    if (!pageId) return;
    setPage(undefined);
    void getPage(pageId).then(setPage);
  }, [pageId]);

  if (page === undefined || pages === null) {
    return <Spinner label="페이지 로딩 중" />;
  }
  if (page === null) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  if (page.spaceId !== spaceId) {
    // 잘못된 스페이스 URL — 페이지가 속한 스페이스로 redirect (W1 최종리뷰 인계 ①)
    return <Navigate to={`/spaces/${page.spaceId}/pages/${page.id}`} replace />;
  }

  const ancestors = ancestorsOf(page, pages);
  const editor = users.find((u) => u.id === page.updatedBy);

  // 경로: 스페이스 → 조상들 → 현재 페이지(href 없음 = 현재 위치)
  const breadcrumbs: BreadcrumbItem[] = [
    { label: space.name, href: `/spaces/${space.id}` },
    ...ancestors.map((a) => ({ label: a.title, href: `/spaces/${space.id}/pages/${a.id}` })),
    { label: page.title },
  ];

  const handleDelete = async () => {
    try {
      await deletePage(page.id);
      toast({ title: `"${page.title}" 페이지를 삭제했습니다`, appearance: "success" });
      await reloadPages();
      navigate(
        page.parentId ? `/spaces/${space.id}/pages/${page.parentId}` : `/spaces/${space.id}`,
      );
    } catch (error) {
      toast({
        title: "삭제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <article className="page-view">
      <PageHeader
        className="page-view-header"
        breadcrumbs={breadcrumbs}
        title={page.title}
        actions={
          <>
            <Button
              size="small"
              onClick={() => navigate(`/spaces/${space.id}/pages/${page.id}/edit`)}
            >
              편집
            </Button>
            <HistoryModal
              page={page}
              users={users}
              onRestored={async (restored) => {
                setPage(restored); // 재조회 없이 반환 Page로 즉시 갱신
                await reloadPages(); // 제목이 복원된 경우 사이드바 트리 반영
              }}
            />
            <Button variant="danger" size="small" onClick={handleDelete}>
              삭제
            </Button>
          </>
        }
      />
      <div className="page-view-meta">
        {editor ? (
          <>
            <Avatar name={editor.name} size="small" />
            <span>{editor.name}</span>
          </>
        ) : null}
        <span>{formatDate(page.updatedAt)} 수정</span>
      </div>
      <MarkdownView markdown={page.body} />
      <CommentSection pageId={page.id} users={users} />
    </article>
  );
}
