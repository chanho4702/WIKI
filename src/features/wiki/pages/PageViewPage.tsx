import { useEffect, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { Avatar, Button, ConfirmDialog, Dropdown, PageHeader, Spinner, Tooltip, useToast } from "@chanho/react";
import type { BreadcrumbItem } from "@chanho/react";
import { Maximize2, Minimize2, MoreHorizontal, Trash2 } from "lucide-react";
import type { Page, User } from "../store/types";
import { deletePage, getPage, listUsers } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/WikiLayout";
import { MarkdownView } from "../components/MarkdownView";
import { TableOfContents } from "../components/TableOfContents";
import { HistoryModal } from "../components/HistoryModal";
import { ChildPages } from "../components/ChildPages";
import { CommentSection } from "../components/CommentSection";
import { usePageWidth } from "../lib/pageWidth";

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
  // Task 18: 페이지 너비 토글 — early return 이전에 호출해야 하는 훅
  const { width, toggle: toggleWidth } = usePageWidth(pageId);
  // 삭제 확인 다이얼로그(공통 ConfirmDialog) — "…" 드롭다운의 삭제에서 연다
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    setDeleting(true);
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
      // 실패 시 다이얼로그를 닫아 페이지로 돌아간다(사유는 Toast로 안내). 성공 시엔 이동으로 언마운트됨.
      setConfirmOpen(false);
      setDeleting(false);
    }
  };

  return (
    <article className={`page-view${width === "full" ? " page-view--full" : ""}`}>
      <PageHeader
        className="page-view-header"
        breadcrumbs={breadcrumbs}
        title={page.title}
        actions={
          <>
            {/* 전체 너비: 아이콘 버튼 + Tooltip. 접근 이름은 aria-label로 고정("전체 너비") */}
            <Tooltip content={width === "full" ? "기본 너비" : "전체 너비"}>
              <Button
                size="small"
                variant="subtle"
                iconOnly
                aria-label="전체 너비"
                aria-pressed={width === "full"}
                onClick={toggleWidth}
              >
                {width === "full" ? (
                  <Minimize2 size={16} aria-hidden="true" />
                ) : (
                  <Maximize2 size={16} aria-hidden="true" />
                )}
              </Button>
            </Tooltip>
            {/* 편집만 primary — 화면의 핵심 액션 */}
            <Button
              size="small"
              onClick={() => navigate(`/spaces/${space.id}/pages/${page.id}/edit`)}
            >
              편집
            </Button>
            {/* 히스토리: 아이콘 버튼(HistoryModal 내부). 모달 트리거라 native title 사용 */}
            <HistoryModal
              page={page}
              users={users}
              onRestored={async (restored) => {
                setPage(restored); // 재조회 없이 반환 Page로 즉시 갱신
                await reloadPages(); // 제목이 복원된 경우 사이드바 트리 반영
              }}
            />
            {/* 삭제는 "…" 드롭다운으로 이동 + confirm 다이얼로그 */}
            <Dropdown
              trigger={
                <Button
                  size="small"
                  variant="subtle"
                  iconOnly
                  aria-label="더 보기"
                  title="더 보기"
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </Button>
              }
              items={[
                {
                  label: "삭제",
                  danger: true,
                  icon: <Trash2 size={16} aria-hidden="true" />,
                  onSelect: () => setConfirmOpen(true),
                },
              ]}
            />
          </>
        }
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="페이지 삭제"
        description={`"${page.title}" 페이지를 삭제합니다. 이 작업은 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        loading={deleting}
        onConfirm={handleDelete}
      />
      <div className="page-view-meta">
        {editor ? (
          <>
            <Avatar name={editor.name} color="auto" size="small" />
            <span>{editor.name}</span>
          </>
        ) : null}
        <span>{formatDate(page.updatedAt)} 수정</span>
      </div>
      <TableOfContents markdown={page.body} />
      <MarkdownView markdown={page.body} pages={pages} spaceId={space.id} />
      <ChildPages pages={pages} currentPageId={page.id} spaceId={space.id} />
      <CommentSection pageId={page.id} users={users} />
    </article>
  );
}
