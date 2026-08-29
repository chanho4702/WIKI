import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router";
import { Avatar, Button, Dropdown, PageHeader, Tooltip, useToast } from "@chanho/react";
import type { BreadcrumbItem } from "@chanho/react";
import { Download, LayoutTemplate, Maximize2, Minimize2, MoreHorizontal, Trash2, Star, Lock } from "lucide-react";
import type { DeletePageOptions, Page, PageNode, PageRestrictions, User } from "../store/types";
import {
  deletePage,
  getPage,
  getPageRestrictions,
  listAncestors,
  listChildren,
  listUsers,
  recordPageView,
  savePageAsTemplate,
} from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { MarkdownView } from "../components/MarkdownView";
import { TableOfContents } from "../components/TableOfContents";
import { HistoryModal } from "../components/HistoryModal";
import { ChildPages } from "../components/ChildPages";
import { DeleteContentDialog } from "../components/DeleteContentDialog";
import { CommentSection } from "../components/CommentSection";
import { PageLabels } from "../components/PageLabels";
import { Backlinks } from "../components/Backlinks";
import { PageAttachments } from "../components/PageAttachments";
import { ExportDialog } from "../components/ExportDialog";
import { WatchButton } from "../components/WatchButton";
import { InlineCommentLayer } from "../components/InlineCommentLayer";
import { usePageWidth } from "../lib/pageWidth";
import { removeStarredPage, useStarredPages } from "../lib/starredPages";
import { RestrictionsDialog } from "../components/RestrictionsDialog";
import { displayUserName } from "../lib/userName";
import { recordVisit } from "../lib/recentVisits";

/** 수정일 표기: 2026-07-10T10:00:00.000Z → "2026년 7월 10일". 빈 값/무효 날짜는 ""(백엔드 모드에서
 * 시각이 없을 때 "Invalid Date" 노출 방지 — 설계 §9). */
function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}


/**
 * 페이지 로딩 자리표시 — 제목·메타·본문 문단의 자리를 미리 잡아 콘텐츠가 들어올 때 화면이
 * 밀리지 않게 한다. 마지막 줄을 짧게 두어 문단의 끝처럼 보이게 한다.
 * 시각 장식이라 aria-hidden이고, 진행 상황은 role=status 문구가 담당한다.
 */
function PageViewSkeleton() {
  return (
    <div className="page-view">
      <span className="wiki-visually-hidden" role="status">
        페이지 로딩 중
      </span>
      <div className="page-view-skeleton" aria-hidden="true">
        <span className="wiki-skeleton page-view-skeleton-title" />
        <span className="wiki-skeleton wiki-skeleton-line" style={{ width: "180px" }} />
        <div className="page-view-skeleton-body">
          {["92%", "100%", "86%", "97%", "54%"].map((width, i) => (
            <span key={i} className="wiki-skeleton wiki-skeleton-line" style={{ width }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PageViewPage() {
  const { spaceId, pageId } = useParams();
  const { space, reloadPages } = useOutletContext<WikiOutletContext>();
  /**
   * 경로(브레드크럼)와 삭제 다이얼로그의 하위 개수는 서버에서 읽는다(2026-08-29).
   * 예전에는 화면이 들고 있던 스페이스 전 페이지를 거슬러 올라가 계산했다 —
   * 그 배열이 사라지면(지연 트리) 조용히 빈 경로가 된다.
   */
  const [ancestors, setAncestors] = useState<PageNode[]>([]);
  const [childCount, setChildCount] = useState(0);
  const navigate = useNavigate();
  const toast = useToast();
  // undefined = 로딩 중, null = 없음
  const [page, setPage] = useState<Page | null | undefined>(undefined);
  const [users, setUsers] = useState<User[]>([]);
  // Task 18: 페이지 너비 토글 — early return 이전에 호출해야 하는 훅
  const { width, toggle: toggleWidth } = usePageWidth(pageId);
  // 페이지 별표 — 사이드바 "별표 표시"와 같은 저장소를 구독한다(토글 즉시 반영)
  const { starred: starredPages, toggle: toggleStar } = useStarredPages();
  // 삭제 확인 다이얼로그(공통 ConfirmDialog) — "…" 드롭다운의 삭제에서 연다
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  /**
   * 본문만 템플릿으로 가져간다(서버가 그렇게 만든다) — 제목까지 가져오면 그 템플릿으로 만든
   * 문서마다 같은 제목이 붙는다. 관리 권한이 없으면 서버가 거절하고 그 메시지를 그대로 보여준다.
   */
  const handleSaveAsTemplate = async () => {
    if (!page) return;
    try {
      const template = await savePageAsTemplate(page.id);
      toast({ title: `템플릿 "${template.name}"을(를) 저장했습니다`, appearance: "success" });
    } catch (error) {
      toast({
        title: "템플릿 저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };
  const bodyRef = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  // 경로·하위 개수 — 부가 정보라 실패해도 본문을 막지 않는다(빈 값으로 둔다).
  useEffect(() => {
    if (!pageId || !spaceId) return;
    let cancelled = false;
    void listAncestors(pageId)
      .then((chain) => {
        if (!cancelled) setAncestors(chain);
      })
      .catch(() => {
        if (!cancelled) setAncestors([]);
      });
    void listChildren(spaceId, pageId)
      .then((children) => {
        if (!cancelled) setChildCount(children.length);
      })
      .catch(() => {
        if (!cancelled) setChildCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId, spaceId]);

  // 조회수 — 진입 시 1회 기록하고 누적치를 표시한다. 부가 신호라 실패는 조용히 무시(표시 생략).
  const [views, setViews] = useState<number | null>(null);
  // 로드 실패(403 페이지 제한·503 등) — 빈 화면/무한 스켈레톤으로 삼키지 않고 에러 상태로 노출
  const [loadError, setLoadError] = useState<string | null>(null);
  // 페이지 제한(W18) — 자물쇠 아이콘 상태 + 다이얼로그. 실패는 조용히(버튼만 기본 상태)
  const [restrictions, setRestrictions] = useState<PageRestrictions | null>(null);
  const [restrictionsOpen, setRestrictionsOpen] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!pageId) return;
    setPage(undefined);
    setViews(null);
    setLoadError(null);
    setRestrictions(null);
    setRestrictionsOpen(false);

    // 본문 VIEW와 제한 관리 권한은 다르다. 두 요청을 독립적으로 시작해야 본문에서 막힌
    // space ADMIN도 제한 API 성공 결과로 복구 버튼을 볼 수 있고, 정상 화면도 waterfall이 없다.
    void getPageRestrictions(pageId)
      .then(setRestrictions)
      .catch(() => setRestrictions(null));
    void getPage(pageId)
      .then((p) => {
        setPage(p);
        if (p) {
          recordVisit(p.id); // "이어서 작업"용 방문 로그(클라이언트)
          void recordPageView(p.id)
            .then(setViews)
            .catch(() => {});
        }
      })
      .catch((e: unknown) => {
        // 서버의 한국어 메시지(예: "이 페이지를 볼 권한이 없습니다" — W18 제한)를 그대로 보여준다
        setLoadError(e instanceof Error ? e.message : "페이지를 불러오지 못했습니다");
      });
  }, [pageId, loadAttempt]);

  if (loadError) {
    return (
      <div className="page-view-error" role="alert">
        <p>{loadError}</p>
        <div className="page-view-error-actions">
          <Button variant="subtle" onClick={() => navigate(-1)}>
            뒤로 가기
          </Button>
          {pageId && restrictions ? (
            <Button onClick={() => setRestrictionsOpen(true)}>페이지 제한 관리</Button>
          ) : null}
        </div>
        {pageId ? (
          <RestrictionsDialog
            open={restrictionsOpen}
            onOpenChange={setRestrictionsOpen}
            pageId={pageId}
            users={users}
            onSaved={(saved) => {
              setRestrictions(saved);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          />
        ) : null}
      </div>
    );
  }
  if (page === undefined) {
    return <PageViewSkeleton />;
  }
  if (page === null) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  if (page.spaceId !== spaceId) {
    // 잘못된 스페이스 URL — 페이지가 속한 스페이스로 redirect (W1 최종리뷰 인계 ①)
    return <Navigate to={`/spaces/${page.spaceId}/pages/${page.id}`} replace />;
  }

  const editor = users.find((u) => u.id === page.updatedBy);

  // 경로: 스페이스 → 조상들 → 현재 페이지(href 없음 = 현재 위치)
  const breadcrumbs: BreadcrumbItem[] = [
    { label: space.name, href: `/spaces/${space.id}` },
    ...ancestors.map((a) => ({ label: a.title, href: `/spaces/${space.id}/pages/${a.id}` })),
    { label: page.title },
  ];

  const handleDelete = async (options?: DeletePageOptions) => {
    setDeleting(true);
    try {
      await deletePage(page.id, options);
      removeStarredPage(page.id); // 죽은 별표가 목록에 남지 않게
      toast({ title: `"${page.title}" 페이지를 삭제했습니다`, appearance: "success" });
      // 이동 전에 다이얼로그를 닫는다 — 열린 채로 언마운트되면 Radix가 배경에 걸어둔
      // aria-hidden이 해제되지 않아 삭제 후 사이드바·본문이 접근성 트리에서 통째로 사라진다.
      setConfirmOpen(false);
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
        title={page.icon ? `${page.icon} ${page.title}` : page.title}
        actions={
          <>
            {/* 자물쇠(W18) — 제한이 있으면 채워진 자물쇠. 다이얼로그에서 보기/편집 제한 관리 */}
            <Tooltip content="페이지 제한">
              <Button
                size="small"
                variant="subtle"
                iconOnly
                aria-label="페이지 제한"
                aria-pressed={
                  (restrictions?.view.length ?? 0) > 0 || (restrictions?.edit.length ?? 0) > 0
                }
                onClick={() => setRestrictionsOpen(true)}
              >
                <Lock
                  size={16}
                  aria-hidden="true"
                  className={
                    (restrictions?.view.length ?? 0) > 0 || (restrictions?.edit.length ?? 0) > 0
                      ? "page-lock page-lock--on"
                      : "page-lock"
                  }
                />
              </Button>
            </Tooltip>
            {/* 별표 — 사이드바 "별표 표시" 목록에 모인다. 눌림 상태는 채운 별 + aria-pressed */}
            <Tooltip content={starredPages.includes(page.id) ? "별표 해제" : "별표"}>
              <Button
                size="small"
                variant="subtle"
                iconOnly
                aria-label="별표"
                aria-pressed={starredPages.includes(page.id)}
                onClick={() => toggleStar({ id: page.id, spaceId: space.id, title: page.title, icon: page.icon })}
              >
                <Star
                  size={16}
                  aria-hidden="true"
                  className={starredPages.includes(page.id) ? "page-star page-star--on" : "page-star"}
                />
              </Button>
            </Tooltip>
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
            <WatchButton pageId={page.id} />
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
                  label: "내보내기",
                  icon: <Download size={16} aria-hidden="true" />,
                  onSelect: () => setExportOpen(true),
                },
                {
                  // 템플릿을 처음부터 쓰는 사람은 드물다 — 이미 잘 쓴 문서 하나가 곧 형식이다
                  label: "템플릿으로 저장",
                  icon: <LayoutTemplate size={16} aria-hidden="true" />,
                  onSelect: () => void handleSaveAsTemplate(),
                },
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
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} page={page} />
      <DeleteContentDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={page.title}
        type={page.type}
        childCount={childCount}
        loading={deleting}
        onConfirm={handleDelete}
      />
      <RestrictionsDialog
        open={restrictionsOpen}
        onOpenChange={setRestrictionsOpen}
        pageId={page.id}
        users={users}
        onSaved={setRestrictions}
      />
      {(() => {
        // 작성자: 이름을 못 찾고 id만 있으면(백엔드 모드) `사용자 #{id}` 폴백. id도 없으면 표기 없음.
        const editorName = editor?.name ?? (page.updatedBy ? displayUserName(page.updatedBy) : null);
        const updatedLabel = formatDate(page.updatedAt);
        if (!editorName && !updatedLabel && views === null) return null; // 표시할 게 하나도 없으면 메타 숨김
        return (
          <div className="page-view-meta">
            {editorName ? (
              <>
                <Avatar name={editorName} color="auto" size="small" />
                <span>{editorName}</span>
              </>
            ) : null}
            {updatedLabel ? <span>{updatedLabel} 수정</span> : null}
            {views !== null ? <span>조회 {views}회</span> : null}
          </div>
        );
      })()}
      {/* 본문에 명시 목차(::toc)가 있으면 자동 목차는 숨긴다 — 같은 목차가 두 번 보이는 중복 방지 */}
      {!/^\s*::toc\s*$/m.test(page.body) && <TableOfContents markdown={page.body} />}
      {/*
        인라인 댓글이 하이라이트를 심을 대상 — 렌더된 본문 DOM이 앵커 기준이다(W21-4).
        대화 상자는 이 스코프를 기준으로 그 줄 오른쪽에 절대 배치된다(W23).
      */}
      <div className="inline-comment-scope">
        <div ref={bodyRef}>
          <MarkdownView markdown={page.body} spaceId={space.id} />
        </div>
        <InlineCommentLayer pageId={page.id} body={page.body} users={users} bodyRef={bodyRef} />
      </div>
      <PageLabels pageId={page.id} spaceId={space.id} />
      <ChildPages currentPageId={page.id} spaceId={space.id} />
      <PageAttachments pageId={page.id} body={page.body} />
      <Backlinks pageId={page.id} spaceId={space.id} />
      <CommentSection pageId={page.id} users={users} />
    </article>
  );
}
