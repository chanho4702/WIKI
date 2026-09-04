import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams, useLocation } from "react-router";
import { Avatar, Banner, Button, Dropdown, Lozenge, PageHeader, Tooltip, useToast } from "@chanho/react";
import type { BreadcrumbItem } from "@chanho/react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { applyOverflowTitle } from "../components/TruncatedText";
import { Archive, BadgeCheck, Download, LayoutTemplate, Maximize2, Minimize2, MoreHorizontal, Share2, Trash2, Star, Lock, UserCog } from "lucide-react";
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
  archivePage,
  unarchivePage,
  setTaskDone,
  unverifyPage,
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
import { ShareDialog } from "../components/ShareDialog";
import { WatchButton } from "../components/WatchButton";
import { InlineCommentLayer } from "../components/InlineCommentLayer";
import { PageReactions } from "../components/PageReactions";
import { usePageWidth } from "../lib/pageWidth";
import { removeStarredPage, useStarredPages } from "../lib/starredPages";
import { RestrictionsDialog } from "../components/RestrictionsDialog";
import { usePersonName } from "../lib/userName";
import { recordVisit } from "../lib/recentVisits";
import { PageOwnerDialog } from "../components/PageOwnerDialog";
import { PageVerifyDialog } from "../components/PageVerifyDialog";
import { editedSinceVerification, verificationState } from "../lib/verification";
import { useReadOnly } from "../lib/readOnly";

/** "2026-12-03" → "2026-12-03"(그대로). 무효 값은 빈 문자열 — 배지에 "Invalid Date"가 뜨지 않게. */
function formatVerifiedUntil(date: string | null | undefined): string {
  if (!date) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

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
  const readOnly = useReadOnly();
  const personName = usePersonName();
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
  const [shareOpen, setShareOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  /** 검증 해제(W27-5) — 되돌리기 쉬운 조작이라 확인 없이 바로 지운다. */
  const handleUnverify = async () => {
    if (!page) return;
    try {
      setPage(await unverifyPage(page.id));
      toast({ title: "검증을 해제했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "검증을 해제하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  /**
   * 본문만 템플릿으로 가져간다(서버가 그렇게 만든다) — 제목까지 가져오면 그 템플릿으로 만든
   * 문서마다 같은 제목이 붙는다. 관리 권한이 없으면 서버가 거절하고 그 메시지를 그대로 보여준다.
   */
  /** 본문 체크박스 토글(W23) — 편집이라 리비전이 남는다. 결과 Page로 즉시 갱신한다. */
  const handleTaskToggle = async (lineNo: number, done: boolean) => {
    if (!page) return;
    try {
      await setTaskDone(page.id, lineNo, done);
      const refreshed = await getPage(page.id);
      if (refreshed) setPage(refreshed);
    } catch (error) {
      toast({
        title: "작업 상태를 바꾸지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  /** 보관/해제 — 하위도 함께 간다(서버 규칙). 결과 Page로 즉시 갱신하고 트리를 다시 읽는다. */
  const handleArchiveToggle = async () => {
    if (!page) return;
    try {
      const next = page.archivedAt ? await unarchivePage(page.id) : await archivePage(page.id);
      setPage(next);
      await reloadPages();
      toast({
        title: next.archivedAt ? `"${next.title}"을(를) 보관했습니다` : `"${next.title}"의 보관을 해제했습니다`,
        appearance: "success",
      });
    } catch (error) {
      toast({
        title: page.archivedAt ? "보관 해제 실패" : "보관 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

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
  /**
   * `#slug`로 들어오면 그 헤딩까지 내린다(W23). 본문은 비동기로 오므로 브라우저의 기본 앵커
   * 점프는 대상이 아직 없을 때 일어나 빈손으로 끝난다 — 본문이 그려진 뒤 다시 한 번 찾는다.
   */
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash || !page) return;
    const id = decodeURIComponent(hash.slice(1));
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: "start" });
  }, [hash, page]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // 익명 인스턴스는 org 사용자 디렉터리를 부르지 않는다 — 이름을 쓰는 자리가 전부 빠진다.
    if (readOnly) return;
    void listUsers().then(setUsers).catch(() => setUsers([]));
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
    // 읽기 전용에는 제한 관리 UI가 없다 — docs 백엔드가 403으로 막는 요청을 보내지 않는다.
    if (!readOnly) {
      void getPageRestrictions(pageId)
        .then(setRestrictions)
        .catch(() => setRestrictions(null));
    }
    void getPage(pageId)
      .then((p) => {
        setPage(p);
        if (p) {
          recordVisit(p.id); // "이어서 작업"용 방문 로그(클라이언트)
          // 공개 문서 인스턴스는 조회수를 세지 않는다(설계 §2.1 — 서버도 이 POST를 403으로 막는다).
          if (!readOnly) {
            void recordPageView(p.id)
              .then(setViews)
              .catch(() => {});
          }
        }
      })
      .catch((e: unknown) => {
        // 서버의 한국어 메시지(예: "이 페이지를 볼 권한이 없습니다" — W18 제한)를 그대로 보여준다
        setLoadError(e instanceof Error ? e.message : "페이지를 불러오지 못했습니다");
      });
  }, [pageId, loadAttempt, readOnly]);

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

  /**
   * 브레드크럼 크럼에 넘칠 때만 title을 붙인다 — DS PageHeader는 label을 문자열로만 받아
   * 우리가 요소로 감쌀 수 없다. 그래서 헤더에 한 번 위임해 두고 렌더된 크럼을 직접 손댄다.
   */
  const handleCrumbHover = (event: ReactMouseEvent<HTMLDivElement>) => {
    const crumb = (event.target as HTMLElement).closest<HTMLElement>(
      'nav > ol > li > a, nav > ol > li > [aria-current="page"]',
    );
    if (crumb && event.currentTarget.contains(crumb)) {
      applyOverflowTitle(crumb, crumb.textContent ?? "");
    }
  };

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
        onMouseOver={handleCrumbHover}
        breadcrumbs={breadcrumbs}
        title={page.icon ? `${page.icon} ${page.title}` : page.title}
        actions={
          <>
            {/* 자물쇠(W18) — 제한이 있으면 채워진 자물쇠. 다이얼로그에서 보기/편집 제한 관리 */}
            {readOnly ? null : (
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
            )}
            {/* 별표 — 사이드바 "별표 표시" 목록에 모인다. 눌림 상태는 채운 별 + aria-pressed */}
            {readOnly ? null : (
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
            )}
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
            {/* 편집만 primary — 화면의 핵심 액션. 읽기 전용 인스턴스에는 편집 라우트가 없다.
              * 히스토리·구독·공유도 뺀다: 복원은 쓰기, 구독은 사용자 개념, 공유는 사용자 선택이
              * 필요하다(주소 공유는 브라우저 주소창으로 충분하다). */}
            {readOnly ? null : (
              <>
                {page.archivedAt ? null : (
                  <Button
                    size="small"
                    onClick={() => navigate(`/spaces/${space.id}/pages/${page.id}/edit`)}
                  >
                    편집
                  </Button>
                )}
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
                {/* 공유(W23) — 보는 사람이면 누구나. 헤더 액션 중 가장 자주 눌리는 것이라 드롭다운에 숨기지 않는다 */}
                <Button
                  size="small"
                  variant="subtle"
                  iconBefore={<Share2 size={16} aria-hidden="true" />}
                  onClick={() => setShareOpen(true)}
                >
                  공유
                </Button>
              </>
            )}
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
                // 나머지는 전부 쓰기다 — 읽기 전용에서는 "…"에 내보내기 하나만 남는다
                ...(readOnly
                  ? []
                  : [
                      {
                        // 보관(W23) — 끝났지만 남겨 둘 문서. 트리·검색에서 빠지고 링크로는 열린다
                        label: page.archivedAt ? "보관 해제" : "보관",
                        icon: <Archive size={16} aria-hidden="true" />,
                        onSelect: () => void handleArchiveToggle(),
                      },
                      {
                        // 소유자·검증(W27-5) — "이 문서 담당이 누구고, 아직 맞는 얘기인가"
                        label: "소유자 지정",
                        icon: <UserCog size={16} aria-hidden="true" />,
                        onSelect: () => setOwnerOpen(true),
                      },
                      {
                        label: page.verifiedUntil ? "검증 해제" : "검증하기",
                        icon: <BadgeCheck size={16} aria-hidden="true" />,
                        onSelect: () =>
                          page.verifiedUntil ? void handleUnverify() : setVerifyOpen(true),
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
                    ]),
              ]}
            />
          </>
        }
      />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} page={page} />
      {readOnly ? null : (
        <>
          <ShareDialog open={shareOpen} onOpenChange={setShareOpen} page={page} users={users} />
          <PageOwnerDialog
            open={ownerOpen}
            onOpenChange={setOwnerOpen}
            page={page}
            users={users}
            onSaved={setPage}
          />
          <PageVerifyDialog
            open={verifyOpen}
            onOpenChange={setVerifyOpen}
            page={page}
            onSaved={setPage}
          />
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
        </>
      )}
      {(() => {
        // 작성자: 이름을 못 찾고 id만 있으면(백엔드 모드) `사용자 #{id}` 폴백. id도 없으면 표기 없음.
        const editorName = personName(page.updatedBy, users);
        const updatedLabel = formatDate(page.updatedAt);
        // 소유자(W27-5) — 정하지 않은 문서에는 아무것도 표시하지 않는다(createdBy로 대신하지 않는다)
        const ownerName = personName(page.ownerId, users);
        const verified = verificationState(page);
        const untilLabel = formatVerifiedUntil(page.verifiedUntil);
        // 검증은 편집으로 자동 해제되지 않는다 — 대신 "그 검증 이후 본문이 바뀌었다"를 덧붙인다
        const editedSince = verified !== "none" && editedSinceVerification(page);
        if (!editorName && !updatedLabel && views === null && !ownerName && verified === "none") {
          return null; // 표시할 게 하나도 없으면 메타 숨김
        }
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
            {ownerName ? (
              <span className="page-view-owner">
                <Avatar name={ownerName} color="auto" size="small" />
                소유자 {ownerName}
              </span>
            ) : null}
            {/* 검증 배지 — 본문 `:status` 지시자와 같은 결(DS Lozenge)이라 한 화면에서 이질감이 없다 */}
            {verified === "verified" ? (
              <Lozenge appearance="success" className="page-view-badge">
                검증됨{untilLabel ? ` · ~${untilLabel}` : ""}
              </Lozenge>
            ) : null}
            {verified === "expired" ? (
              <Lozenge appearance="warning" className="page-view-badge">
                검증 만료
              </Lozenge>
            ) : null}
            {/* 색이 아니라 글자로 알린다(WCAG 1.4.1) — 만료 배지 옆에도 함께 붙을 수 있다 */}
            {editedSince ? (
              <Lozenge appearance="neutral" className="page-view-badge">
                검증 후 수정됨
              </Lozenge>
            ) : null}
          </div>
        );
      })()}
      {/* 보관된 문서(W23) — 읽히지만 고칠 수 없다는 것을 본문 위에서 알린다 */}
      {page.archivedAt ? (
        <Banner
          variant="info"
          action={
            readOnly ? undefined : { label: "보관 해제", onClick: () => void handleArchiveToggle() }
          }
        >
          보관된 문서입니다. 트리와 검색에서 빠져 있고, 편집하려면 보관을 해제해야 합니다.
        </Banner>
      ) : null}
      {/* 본문에 명시 목차(::toc)가 있으면 자동 목차는 숨긴다 — 같은 목차가 두 번 보이는 중복 방지 */}
      {!/^\s*::toc\s*$/m.test(page.body) && <TableOfContents markdown={page.body} />}
      {/*
        인라인 댓글이 하이라이트를 심을 대상 — 렌더된 본문 DOM이 앵커 기준이다(W21-4).
        대화 상자는 이 스코프를 기준으로 그 줄 오른쪽에 절대 배치된다(W23).
      */}
      <div className="inline-comment-scope">
        <div ref={bodyRef}>
          <MarkdownView
            markdown={page.body}
            spaceId={space.id}
            // 보관 중엔 편집이 막힌다 — 체크박스도 읽기 전용으로 둔다(읽기 전용 인스턴스도 같다)
            onTaskToggle={page.archivedAt || readOnly ? undefined : handleTaskToggle}
          />
        </div>
        <InlineCommentLayer pageId={page.id} body={page.body} users={users} bodyRef={bodyRef} />
      </div>
      {/* 본문 바로 아래 — 다 읽고 나서 누르는 자리다(W23). 리액션은 곧 쓰기라 읽기 전용에선 없다 */}
      {readOnly ? null : <PageReactions pageId={page.id} />}
      <PageLabels pageId={page.id} spaceId={space.id} />
      <ChildPages currentPageId={page.id} spaceId={space.id} />
      <PageAttachments pageId={page.id} body={page.body} />
      <Backlinks pageId={page.id} spaceId={space.id} />
      <CommentSection pageId={page.id} users={users} />
    </article>
  );
}
