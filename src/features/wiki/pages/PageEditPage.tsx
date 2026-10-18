import { useEffect, useRef, useState } from "react";
import { Navigate, useBlocker, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { Button, ConfirmDialog, TextField, useToast } from "@chanho/react";
import {
  commitCollaborationDraft,
  createPage,
  deletePage,
  getPage,
  publishPage,
  updatePage,
  listUsers,
  setPageIcon,
} from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { useWikiLinkCache } from "../lib/useWikiLinkCache";
import { WikiEditor, type WikiEditorHandle } from "../editor/WikiEditor";
import { usePageWidth } from "../lib/pageWidth";
import { DRAFT_TITLE } from "../lib/useCreateContent";
import { EditConflictPanel, type EditConflictVariant } from "../components/EditConflictPanel";
import { DraftBadge } from "../components/DraftBadge";
import { PageConflictError, type Page, type User } from "../store/types";
import { SkeletonLines } from "../components/WikiSkeleton";
import { TruncatedText } from "../components/TruncatedText";
import { CollaborationStatus } from "../editor/components/CollaborationStatus";
import {
  COLLABORATION_ENABLED,
  useCollaborationSession,
} from "../editor/collaboration/useCollaborationSession";
import { replaceCollaborativeTitle } from "../editor/collaboration/title";
import { EmojiPicker } from "../editor/components/EmojiPicker";
import { canCommitCollaborationDraft } from "../editor/collaboration/availability";

interface EditConflict {
  variant: EditConflictVariant;
  serverPage: Page | null;
  localTitle: string;
  localBody: string;
}

/**
 * 페이지 편집 화면 — 생성(/pages/new?parent=<id|없음>)과 수정(/pages/:pageId/edit) 공용.
 * 노션풍: 대형 인라인 제목 + WYSIWYG 본문. 저장은 명시적(컨플식).
 */
export function PageEditPage() {
  const { spaceId, pageId } = useParams();
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get("parent"); // 생성 모드 전용 — 없으면 루트에 생성
  const navigate = useNavigate();
  const toast = useToast();
  const { reloadPages } = useOutletContext<WikiOutletContext>();
  // 단독 편집(WikiEditor)과 공동 편집(useCollaborationSession)이 같은 링크 캐시를 봐야
  // 링크 칩 판별이 두 경로에서 일관된다(2026-08-28).
  const linkCache = useWikiLinkCache();
  // 편집 라우트는 A→B 이동 때 이 컴포넌트를 재사용한다. 비동기 결과를 적용하기 전에 요청 시점의 페이지가
  // 아직 현재 페이지인지 확인해, A의 응답이 B에 적용되지 않게 한다.
  const currentPageIdRef = useRef(pageId);
  currentPageIdRef.current = pageId;
  const isEdit = pageId !== undefined;

  const editorRef = useRef<WikiEditorHandle>(null);
  const [title, setTitle] = useState(() => (isEdit ? "" : (searchParams.get("title") ?? "")));
  const [initialTitle, setInitialTitle] = useState<string | null>(() =>
    (isEdit ? null : (searchParams.get("title") ?? "")));
  const [initialBody, setInitialBody] = useState<string | null>(isEdit ? null : "");
  const [notFound, setNotFound] = useState(false);
  // 멘션(@) 자동완성 후보 — org 사용자 디렉터리. 실패해도 편집을 막지 않는다(listUsers가 빈 목록 폴백).
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);
  // 수정 모드에서 로드한 페이지의 실제 spaceId (URL 불일치 가드용)
  const [pageSpaceId, setPageSpaceId] = useState<string | null>(null);
  // 로드한 페이지의 현재 부모 — 저장 시 넘겨 어댑터의 사전 조회를 없앤다(W-19). undefined = 아직 모름.
  const [baseParentId, setBaseParentId] = useState<string | null | undefined>(undefined);
  // Task 5: 제목 변경 추적 (본문은 WikiEditor.isDirty()로 추적)
  const [titleDirty, setTitleDirty] = useState(false);
  /**
   * 변경 요약(W22) — 이 저장이 만드는 버전에 붙는 한 줄. 선택 입력이다.
   * 새 문서(초안 게시)에는 비교 대상이 없어 요약도 의미가 없으므로 수정 화면에서만 받는다.
   */
  const [changeNote, setChangeNote] = useState("");
  // 페이지 이모지 아이콘 — 기존 페이지는 즉시 저장(메타데이터 변경), 새 문서는 저장 시 함께 적용
  const [icon, setIcon] = useState<string | null>(null);
  // 저장 진행 상태 — 업데이트 버튼 로딩 표시 + 중복 저장 차단
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  // 편집 시작 시점의 버전 — 저장 직전 최신값으로 바꾸면 stale 편집을 감지할 수 없다.
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [conflict, setConflict] = useState<EditConflict | null>(null);
  const [conflictComparisonOpen, setConflictComparisonOpen] = useState(false);
  // 서버본 재로드 때 TipTap 인스턴스를 명시적으로 새로 만들어 initialMarkdown을 다시 적용한다.
  const [editorGeneration, setEditorGeneration] = useState(0);
  // Task 18: 페이지 너비 토글 — 생성 화면(pageId 없음)은 항상 기본 폭, toggle은 무동작
  const { width, toggle: toggleWidth } = usePageWidth(pageId);

  // 본문 수정 여부(상태) — dirtyRef만으로는 렌더가 갱신되지 않아 저장 상태 표시가 멈춘다.
  // 진실의 원천은 여전히 에디터의 isDirty()이고, 이건 표시 전용 미러다.
  const [bodyDirty, setBodyDirty] = useState(false);
  // 편집 중인 문서가 초안인지 — 초안이면 "업데이트" 대신 "게시"가 주 액션이다(기획 P3).
  const [isDraft, setIsDraft] = useState(false);
  // 초안 작성자 — "나만 보임/작성자만 보임" 표시용. 새 문서는 저장 전이라 작성자가 곧 나다.
  const [draftAuthor, setDraftAuthor] = useState<string | null>(null);
  const collaboration = useCollaborationSession({
    enabled: COLLABORATION_ENABLED && isEdit && !notFound,
    pageId: pageId ?? null,
    basePageVersion: baseVersion,
    initialTitle,
    initialMarkdown: initialBody,
    getLinkTargets: () => linkCache.targetsRef.current,
  });
  const collaborationRequired = COLLABORATION_ENABLED && isEdit;
  const collaborationReady = !collaborationRequired
    || (collaboration.binding !== null && collaboration.generation !== null);
  const collaborationCommitReady = !collaborationRequired || canCommitCollaborationDraft(
    collaboration.status,
    collaboration.binding !== null,
    collaboration.generation,
  );

  // 공동 초안 리셋(다른 경로의 저장·close 4409·옛 페이지 버전) — 조용히 재연결하지 않는다. 서버 최신본과
  // 이 탭의 편집(현재 에디터 Markdown)을 나란히 보여 주고, 사용자가 확인해야 최신 버전 기준으로 새로 시작한다.
  const resetHandledRef = useRef(false);
  const pageLoaded = baseVersion !== null;
  useEffect(() => {
    if (collaboration.status !== "stale") {
      resetHandledRef.current = false;
      return;
    }
    // 페이지 로드 전(기준 버전 없음)에는 처리하지 않는다 — 로드가 충돌 상태를 비운다.
    if (resetHandledRef.current || !pageId || !pageLoaded) return;
    resetHandledRef.current = true;
    // 편집기가 살아 있으면 지금 내용을, 이미 닫혔으면 훅이 스냅샷에서 되살린 사본을 보여 준다.
    const liveBody = editorRef.current?.getMarkdown();
    const localCopy = collaboration.localCopy;
    setConflict({
      variant: "collaboration-reset",
      serverPage: null,
      localTitle: liveBody === undefined && localCopy ? localCopy.title : title,
      localBody: liveBody ?? localCopy?.markdown ?? initialBody ?? "",
    });
    setConflictComparisonOpen(false);
    let cancelled = false;
    void getPage(pageId).catch(() => null).then((serverPage) => {
      if (cancelled) return;
      setConflict((current) => (current?.variant === "collaboration-reset"
        ? { ...current, serverPage }
        : current));
      setConflictComparisonOpen(Boolean(serverPage));
    });
    return () => {
      cancelled = true;
    };
    // title·initialBody는 리셋을 감지한 시점의 값만 필요하다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collaboration.status, pageId, pageLoaded]);

  // 제목도 본문과 같은 Y.Doc의 Y.Text를 사용한다. 원격 update가 오면 controlled input과 dirty 표시를
  // 함께 갱신하고, 재연결 뒤에는 마지막 published title과 비교해 미게시 변경을 숨기지 않는다.
  useEffect(() => {
    const sharedTitle = collaboration.binding?.title;
    if (!sharedTitle || initialTitle === null) return;
    const syncTitle = () => {
      const nextTitle = sharedTitle.toString();
      setTitle(nextTitle);
      setTitleDirty(nextTitle !== initialTitle);
    };
    syncTitle();
    sharedTitle.observe(syncTitle);
    return () => sharedTitle.unobserve(syncTitle);
  }, [collaboration.binding?.title, initialTitle]);

  // Task 5: 이탈 가드 — 제목·본문 미저장 변경 감지
  // 리셋 뒤 편집기가 닫혀도 훅이 되살린 로컬 사본은 이 탭에만 남은 유일한 편집이다 — 재시작 전까지 미저장으로 본다.
  const isDirty = () => titleDirty || imageUploading || collaboration.localCopy !== null
    || (editorRef.current?.isDirty() ?? false);

  /**
   * 이 화면이 스스로 떠나는 이동(저장 성공·닫기 확인 뒤)은 가드를 건너뛴다. 저장 직후에도 titleDirty는
   * 아직 true라, 표시를 끄지 않으면 방금 저장한 사용자에게 "저장하지 않은 변경"을 묻게 된다.
   */
  const leavingRef = useRef(false);
  const leave = (to: string) => {
    leavingRef.current = true;
    navigate(to);
  };

  // 앱 안 이동 가드(W-17) — 사이드바 트리·상단 바·알림 링크 등 라우터 이동. 데이터 라우터(main.tsx)라
  // useBlocker를 쓸 수 있다. 같은 경로 안의 쿼리 변경(?title= 프리필)은 편집을 버리지 않으므로 막지 않는다.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    !leavingRef.current
    && currentLocation.pathname !== nextLocation.pathname
    && isDirty());

  // 브라우저 새로고침/닫기 가드 — 라우터 밖 이동이라 useBlocker가 못 잡는다
  // 훅은 조건부가 아닌 곳에 고정해야 함 — early return 가드 이전에 배치
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  });

  useEffect(() => {
    if (!isEdit || !pageId) return;
    // edit(A) → edit(B) 재사용 시 이전 페이지의 본문이 새 페이지 로딩 중 잠깐 노출되는 것을 방지
    setInitialTitle(null);
    setInitialBody(null);
    setNotFound(false);
    setBaseVersion(null);
    setConflict(null);
    setConflictComparisonOpen(false);
    setTitleDirty(false);
    setBodyDirty(false);
    leavingRef.current = false;
    let cancelled = false;
    void getPage(pageId).then((page) => {
      if (cancelled) return;
      if (page === null) {
        setNotFound(true);
      } else {
        setTitle(page.title);
        setInitialTitle(page.title);
        setInitialBody(page.body);
        setBaseVersion(page.version);
        setPageSpaceId(page.spaceId);
        setBaseParentId(page.parentId);
        setIsDraft(page.status === "draft");
        setDraftAuthor(page.createdBy);
        setIcon(page.icon ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isEdit, pageId]);

  // 같은 create 라우트 안에서 ?title=만 바뀌는 네비게이션(미리보기의 빨간 링크 클릭)도 프리필 반영
  useEffect(() => {
    if (isEdit) return;
    const prefill = searchParams.get("title");
    if (prefill !== null) {
      setTitle(prefill);
      setInitialTitle(prefill);
      setTitleDirty(false); // Task 5: 프리필은 사용자 변경이 아님
    }
  }, [isEdit, searchParams]);

  if (!spaceId) {
    // 라우팅상 도달 불가 — 타입 좁히기용 가드
    return <Navigate to="/" replace />;
  }
  if (notFound) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }
  if (initialBody === null) {
    return (
      <div className="page-edit">
        <div className="page-edit-body">
          <SkeletonLines label="페이지 로딩 중" widths={["40%", "100%", "92%", "97%", "60%"]} />
        </div>
      </div>
    );
  }
  if (isEdit && pageId && pageSpaceId !== null && pageSpaceId !== spaceId) {
    // 잘못된 스페이스 URL — 페이지가 속한 스페이스의 편집 URL로 redirect (PageViewPage와 동일 패턴)
    return <Navigate to={`/spaces/${pageSpaceId}/pages/${pageId}/edit`} replace />;
  }

  /** 이모지 아이콘 변경 — 기존 페이지는 즉시 영속(버전 스냅샷 없는 메타데이터 변경),
   * 새 문서는 아직 id가 없어 로컬에 들고 있다가 저장 시 적용한다. */
  const changeIcon = (next: string | null) => {
    setIcon(next);
    if (isEdit && pageId) {
      void setPageIcon(pageId, next)
        .then(() => reloadPages()) // 사이드바 트리의 문서 아이콘이 즉시 이모지로 바뀌어야 한다
        .catch(() => {
          toast({ title: "이모지 저장에 실패했습니다", appearance: "danger" });
        });
    }
  };

  const handleSave = async () => {
    if (!collaborationReady) {
      toast({ title: "공동 편집 문서를 준비한 뒤 저장해 주세요", appearance: "info" });
      return;
    }
    if (!collaborationCommitReady) {
      toast({
        title: "연결이 복구되고 동기화된 뒤 저장해 주세요",
        description: "현재 편집 내용은 이 탭에 임시 보관되어 있습니다.",
        appearance: "info",
      });
      return;
    }
    if (imageUploading) {
      toast({ title: "이미지 업로드가 끝난 뒤 저장해 주세요", appearance: "info" });
      return;
    }
    // 공동 편집은 dirty 여부와 무관하게 항상 공유 Y.Doc(편집기)을 직렬화해 보낸다. 다른 편집자의 게시·재연결로
    // 공유 문서가 initialBody와 달라져도 편집기의 isDirty()는 false일 수 있다 — 그때 initialBody를 보내면
    // 옛 본문이 새 버전으로 게시돼 최신 게시본을 덮는다. 제목도 공유 title에서 읽는다.
    const sharedTitle = collaborationRequired ? collaboration.binding?.title.toString() : undefined;
    if (collaborationRequired && (!editorRef.current || sharedTitle === undefined)) {
      toast({ title: "공동 편집 문서를 준비한 뒤 저장해 주세요", appearance: "info" });
      return;
    }
    const saveTitle = sharedTitle ?? title;
    // 단독 편집의 본문 불변 보장 — 본문 미수정이면 직렬화 대신 원문 그대로 (버전 diff 노이즈 방지)
    const body = collaborationRequired || editorRef.current?.isDirty()
      ? editorRef.current!.getMarkdown()
      : initialBody;
    const requestedPageId = pageId;
    setSaving(true);
    try {
      if (isEdit && pageId) {
        const saved = collaborationRequired
          ? (await commitCollaborationDraft(pageId, { title: saveTitle, body }, {
              // 다른 편집자의 정상 게시로 초안 기준이 앞서 나갔으면 그 버전을 기대 버전으로 쓴다.
              expectedVersion: collaboration.basePageVersion ?? baseVersion!,
              expectedGeneration: collaboration.generation!,
            })).page
          : await updatePage(pageId, { title: saveTitle, body }, {
              expectedVersion: baseVersion ?? undefined,
              changeNote: changeNote.trim() || undefined,
              parentId: baseParentId,
            });
        if (currentPageIdRef.current !== requestedPageId) {
          setSaving(false);
          return;
        }
        setBaseVersion(saved.version);
        await editorRef.current?.finalizePendingUploads();
        // 초안은 "저장"만으로 공개되지 않는다 — 이 버튼이 곧 게시다(라벨도 "게시").
        // 저장을 먼저 하는 이유: 게시 후 저장이 실패하면 빈 문서가 공개된 채 남는다.
        if (isDraft) await publishPage(saved.id);
        toast({
          title: isDraft ? "페이지를 게시했습니다" : "페이지를 저장했습니다",
          appearance: "success",
        });
        await reloadPages();
        leave(`/spaces/${spaceId}/pages/${saved.id}`);
      } else {
        const created = await createPage({ spaceId, parentId, title, body });
        if (icon) await setPageIcon(created.id, icon).catch(() => {});
        toast({ title: `"${created.title}" 페이지를 만들었습니다`, appearance: "success" });
        await reloadPages();
        leave(`/spaces/${spaceId}/pages/${created.id}`);
      }
    } catch (error) {
      if (currentPageIdRef.current !== requestedPageId) {
        setSaving(false);
        return;
      }
      if (error instanceof PageConflictError) {
        // 공동 편집 게시의 409는 초안의 기준 버전이 낡았다는 뜻이다. 옛 Y.Doc 위에서 "병합 계속"하면
        // 옛 본문이 새 기준으로 bootstrap되므로, 최신 버전 기준 재시작 흐름으로 보낸다.
        setConflict({
          variant: collaborationRequired ? "collaboration-reset" : "save",
          serverPage: error.serverPage,
          localTitle: saveTitle,
          localBody: body,
        });
        setConflictComparisonOpen(Boolean(error.serverPage));
        toast({
          title: "저장하지 않았습니다",
          description: error.message,
          appearance: "danger",
        });
        setSaving(false);
        return;
      }
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
      // 성공 시엔 이동으로 언마운트되므로 실패 시에만 로딩 해제
      setSaving(false);
    }
  };

  const copyDocument = async (label: string, copyTitle: string, copyBody: string) => {
    if (!navigator.clipboard?.writeText) {
      toast({
        title: `${label}을 복사할 수 없습니다`,
        description: "브라우저 클립보드 권한을 확인해 주세요.",
        appearance: "danger",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(`# ${copyTitle}\n\n${copyBody}`);
      toast({ title: `${label}을 클립보드에 복사했습니다`, appearance: "success" });
    } catch {
      toast({
        title: `${label}을 복사할 수 없습니다`,
        description: "브라우저 클립보드 권한을 확인해 주세요.",
        appearance: "danger",
      });
    }
  };

  const reloadServerVersion = async () => {
    const serverPage = conflict?.serverPage;
    if (!serverPage) return;
    if (!window.confirm(
      "내 편집 내용을 버리고 서버에 저장된 최신 내용으로 다시 불러오시겠습니까?",
    )) return;
    const requestedPageId = pageId;
    await editorRef.current?.discardPendingUploads();
    if (currentPageIdRef.current !== requestedPageId) return;
    setTitle(serverPage.title);
    setInitialTitle(serverPage.title);
    setInitialBody(serverPage.body);
    setBaseVersion(serverPage.version);
    setTitleDirty(false);
    setBodyDirty(false);
    setImageUploading(false);
    setConflict(null);
    setConflictComparisonOpen(false);
    setEditorGeneration((generation) => generation + 1);
  };

  /** 리셋된 공동 초안을 최신 페이지 버전 기준의 새 세션으로 다시 연다. 옛 Y.Doc 스냅샷은 쓰지 않는다. */
  const restartCollaboration = async () => {
    if (!pageId) return;
    if (!window.confirm(
      "이 탭의 편집 내용은 새 공동 문서에 합쳐지지 않습니다. 옮길 내용을 복사해 두었다면 서버 최신본 기준으로 공동 편집을 다시 시작하시겠습니까?",
    )) return;
    const requestedPageId = pageId;
    const latest = await getPage(requestedPageId).catch(() => null);
    if (currentPageIdRef.current !== requestedPageId) return;
    if (!latest) {
      toast({
        title: "최신 문서를 불러오지 못했습니다",
        description: "잠시 후 다시 시도해 주세요. 이 탭의 편집 내용은 그대로 있습니다.",
        appearance: "danger",
      });
      return;
    }
    await editorRef.current?.discardPendingUploads();
    if (currentPageIdRef.current !== requestedPageId) return;
    setTitle(latest.title);
    setInitialTitle(latest.title);
    setInitialBody(latest.body);
    setBaseVersion(latest.version);
    setIsDraft(latest.status === "draft");
    setDraftAuthor(latest.createdBy);
    setTitleDirty(false);
    setBodyDirty(false);
    setImageUploading(false);
    setConflict(null);
    setConflictComparisonOpen(false);
    setEditorGeneration((generation) => generation + 1);
    collaboration.restart();
  };

  const continueManualMerge = () => {
    if (conflict?.variant === "collaboration-reset") {
      void restartCollaboration();
      return;
    }
    const serverPage = conflict?.serverPage;
    if (!serverPage) return;
    setBaseVersion(serverPage.version);
    setConflict(null);
    setConflictComparisonOpen(false);
    toast({
      title: `서버 v${serverPage.version}을 병합 기준으로 설정했습니다`,
      description: "서버 변경을 현재 편집 내용에 반영한 뒤 다시 저장해 주세요.",
      appearance: "info",
    });
  };

  const handleCancel = async () => {
    // Task 5: dirty 이탈 가드
    if (isDirty() && !window.confirm("저장하지 않은 변경이 있습니다. 나가시겠습니까?")) {
      return;
    }
    await editorRef.current?.discardPendingUploads();
    // 손대지 않은 초안은 닫을 때 지운다. 생성 버튼이 초안을 즉시 만들어 트리에 세우는 구조라,
    // 정리하지 않으면 실수로 누른 만큼 "제목 없음"이 트리에 쌓인다. 제목이나 본문을 건드렸으면
    // 사용자의 작업물이므로 남긴다(초안 상태로).
    // 공동 편집에서는 다른 편집자가 공유 문서에 쓴 내용이 이 탭의 isDirty()·initialBody에 드러나지 않는다 —
    // 동기화된(synced) 세션의 공유 문서(편집기) 자체가 비어 있을 때만 "손대지 않은 초안"으로 본다. 리셋·연결 전
    // 등 synced가 아니면 이 탭의 편집기는 서버를 대변하지 못하므로 자동 삭제를 하지 않는다.
    const untouchedBody = collaborationRequired
      ? collaboration.status === "synced"
        && editorRef.current !== null
        && !editorRef.current.getMarkdown().trim()
      : !initialBody;
    if (isEdit && pageId && isDraft && !isDirty() && title === DRAFT_TITLE && untouchedBody) {
      try {
        // 지우기 직전에 서버본을 다시 확인한다 — 그사이 다른 경로가 채우거나 게시했으면 남긴다.
        const server = await getPage(pageId);
        const expectedVersion = collaboration.basePageVersion ?? baseVersion;
        const stillEmptyDraft = server !== null
          && server.status === "draft"
          && server.title === DRAFT_TITLE
          && !server.body.trim()
          && server.version === expectedVersion;
        if (!stillEmptyDraft) throw new Error("초안이 그사이 바뀌었습니다");
        await deletePage(pageId);
        await reloadPages();
        leave(`/spaces/${spaceId}`);
        return;
      } catch {
        // 삭제 실패는 조용히 넘긴다 — 취소 동작 자체를 막을 이유가 없다(초안은 그대로 남는다)
      }
    }
    if (isEdit) {
      leave(`/spaces/${spaceId}/pages/${pageId}`); // 수정 취소 → 보기
    } else if (parentId) {
      leave(`/spaces/${spaceId}/pages/${parentId}`); // 하위 생성 취소 → 부모 보기
    } else {
      leave(`/spaces/${spaceId}`); // 루트 생성 취소 → 스페이스 인덱스
    }
  };

  return (
    <div className={`page-edit${width === "full" ? " page-edit--full" : ""}`}>
      {/* W6: 컨플식 편집 크롬 — 최상단 고정 바. 좌측은 title state를 비편집으로 미리보기만 한다. */}
      <div className="edit-chrome">
        <TruncatedText className="edit-chrome-title" text={title.trim() ? title : "제목 없음"} />
        {/* 캡처(07-26-편집구조_레이아웃.png)의 "저장됨" 자리 — 저장 여부를 항상 보이게 한다.
          * 이 앱은 자동 저장이 아니라 명시적 저장이므로 "저장 중"이 아니라 "저장되지 않은 변경"이
          * 기본 경고 문구다(사용자가 직접 눌러야 저장된다는 사실을 숨기지 않는다). */}
        <span
          className={`edit-chrome-status${titleDirty || bodyDirty ? " edit-chrome-status--dirty" : ""}`}
          role="status"
        >
          {titleDirty || bodyDirty
            ? "저장되지 않은 변경"
            : isDraft
              ? "초안 — 아직 게시되지 않음"
              : "저장됨"}
        </span>
        {isDraft && draftAuthor !== null ? <DraftBadge createdBy={draftAuthor} /> : null}
        <CollaborationStatus
          status={collaboration.status}
          participants={collaboration.participants}
          hasLocalDocument={collaboration.binding !== null}
          error={collaboration.error}
          onRetry={collaboration.retry}
        />
        <div className="edit-chrome-actions">
          {isEdit && pageId ? (
            <Button
              size="small"
              variant="subtle"
              className="edit-chrome-width-toggle"
              aria-label="전체 너비"
              aria-pressed={width === "full"}
              onClick={toggleWidth}
            >
              {width === "full" ? "기본 너비" : "전체 너비"}
            </Button>
          ) : null}
          {/* 이미 게시된 문서를 고칠 때만 요약을 받는다 — 첫 게시는 비교 대상이 없다 */}
          {isEdit && !isDraft ? (
            <TextField
              className="edit-chrome-change-note"
              label="변경 요약 (선택)"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="무엇을 왜 고쳤는지 한 줄"
              maxLength={500}
            />
          ) : null}
          <Button
            onClick={handleSave}
            disabled={!title.trim() || imageUploading || !collaborationCommitReady}
            loading={saving}
          >
            {isDraft ? "게시" : "업데이트"}
          </Button>
          <Button variant="subtle" onClick={() => void handleCancel()}>
            닫기
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
        title="저장하지 않은 변경이 있습니다"
        description="이 화면을 떠나면 저장하지 않은 편집 내용이 사라집니다."
        confirmLabel="나가기"
        cancelLabel="계속 편집"
        danger
        onConfirm={() => {
          if (blocker.state !== "blocked") return;
          // 나가기로 한 이동이다 — 업로드 중이던 이미지도 함께 버린다(닫기 버튼과 같은 정리)
          void editorRef.current?.discardPendingUploads();
          blocker.proceed();
        }}
      />
      {conflict ? (
        <div className="page-edit-body">
        <EditConflictPanel
          serverPage={conflict.serverPage}
          localTitle={conflict.localTitle}
          localBody={conflict.localBody}
          comparisonOpen={conflictComparisonOpen}
          variant={conflict.variant}
          onToggleComparison={() => setConflictComparisonOpen((open) => !open)}
          onCopyLocal={() => {
            // 리셋 뒤에도 편집기는 이 탭의 로컬 문서로 계속 열려 있다 — 복사는 지금 내용 기준이다.
            const liveBody = conflict.variant === "collaboration-reset"
              ? editorRef.current?.getMarkdown()
              : undefined;
            void copyDocument(
              "내 변경",
              liveBody === undefined ? conflict.localTitle : title,
              liveBody ?? conflict.localBody,
            );
          }}
          onCopyServer={() => {
            if (conflict.serverPage) {
              void copyDocument("서버본", conflict.serverPage.title, conflict.serverPage.body);
            }
          }}
          onReloadServer={() => void reloadServerVersion()}
          onContinueMerge={continueManualMerge}
        />
        </div>
      ) : null}
      {collaborationRequired && !collaboration.binding ? (
        <div className="page-edit-body">
        <div
          className={`collaboration-editor-gate collaboration-editor-gate--${collaboration.status}`}
          role="status"
        >
          <span className="collaboration-editor-gate-mark" aria-hidden="true" />
          <div>
            <strong>
              {collaboration.status === "stale"
                ? "공동 초안이 새로 시작되었습니다"
                : collaboration.status === "error"
                  ? "공동 편집 연결을 복구해 주세요"
                  : collaboration.status === "offline"
                    ? "네트워크 연결을 기다리고 있습니다"
                    : "공동 편집 문서를 준비하고 있습니다"}
            </strong>
            <p>
              {collaboration.status === "stale"
                ? "서버 최신본을 확인한 뒤 최신 버전 기준으로 다시 시작해 주세요."
                : "기존 내용을 안전하게 동기화한 뒤 편집기가 열립니다."}
            </p>
          </div>
        </div>
        </div>
      ) : (
        <WikiEditor
          key={`${pageId ?? "new"}:${editorGeneration}:${collaborationRequired ? "shared" : "solo"}`}
          ref={editorRef}
          contentHeader={
            /* 컨플 편집 화면(페이지편집.png): 툴바 줄은 전체 너비, 큰 제목은 그 아래 콘텐츠
             * 칼럼 맨 위에 온다 — 제목을 에디터의 콘텐츠 칼럼 안에 그린다. */
            <div className="page-edit-title-row">
              <EmojiPicker
                triggerLabel="페이지 이모지"
                triggerChar={icon}
                onPick={changeIcon}
                onClear={() => changeIcon(null)}
              />
              <input
                className="page-edit-title"
                value={title}
                onChange={(e) => {
                  const nextTitle = e.target.value;
                  if (collaboration.binding) {
                    replaceCollaborativeTitle(collaboration.binding.title, nextTitle);
                  } else {
                    setTitle(nextTitle);
                    setTitleDirty(nextTitle !== initialTitle);
                  }
                }}
                disabled={!collaborationReady || saving}
                placeholder="제목 없음"
                aria-label="페이지 제목"
              />
            </div>
          }
          initialMarkdown={initialBody}
          spaceId={spaceId}
          linkCache={linkCache}
          users={users}
          pageId={pageId}
          onDirty={() => setBodyDirty(true)}
          onUploadStateChange={setImageUploading}
          collaborationExtensions={collaboration.binding?.extensions}
        />
      )}
    </div>
  );
}
