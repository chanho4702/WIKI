import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { Button, Spinner, useToast } from "@chanho/react";
import { createPage, getPage, updatePage } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/WikiLayout";
import { WikiEditor, type WikiEditorHandle } from "../editor/WikiEditor";
import { usePageWidth } from "../lib/pageWidth";

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
  const { pages, reloadPages } = useOutletContext<WikiOutletContext>();
  const isEdit = pageId !== undefined;

  const editorRef = useRef<WikiEditorHandle>(null);
  const [title, setTitle] = useState(() => (isEdit ? "" : (searchParams.get("title") ?? "")));
  const [initialBody, setInitialBody] = useState<string | null>(isEdit ? null : "");
  const [notFound, setNotFound] = useState(false);
  // 수정 모드에서 로드한 페이지의 실제 spaceId (URL 불일치 가드용)
  const [pageSpaceId, setPageSpaceId] = useState<string | null>(null);
  // Task 5: 제목 변경 추적 (본문은 WikiEditor.isDirty()로 추적)
  const [titleDirty, setTitleDirty] = useState(false);
  // Task 18: 페이지 너비 토글 — 생성 화면(pageId 없음)은 항상 기본 폭, toggle은 무동작
  const { width, toggle: toggleWidth } = usePageWidth(pageId);

  // Task 5: 이탈 가드 — 제목·본문 미저장 변경 감지
  const isDirty = () => titleDirty || (editorRef.current?.isDirty() ?? false);

  // 브라우저 새로고침/닫기 가드 — 라우터 내비게이션은 선언형 Routes라 useBlocker 불가(스펙 각주 참조)
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
    setInitialBody(null);
    void getPage(pageId).then((page) => {
      if (page === null) {
        setNotFound(true);
      } else {
        setTitle(page.title);
        setInitialBody(page.body);
        setPageSpaceId(page.spaceId);
      }
    });
  }, [isEdit, pageId]);

  // 같은 create 라우트 안에서 ?title=만 바뀌는 네비게이션(미리보기의 빨간 링크 클릭)도 프리필 반영
  useEffect(() => {
    if (isEdit) return;
    const prefill = searchParams.get("title");
    if (prefill !== null) {
      setTitle(prefill);
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
    return <Spinner label="페이지 로딩 중" />;
  }
  if (isEdit && pageId && pageSpaceId !== null && pageSpaceId !== spaceId) {
    // 잘못된 스페이스 URL — 페이지가 속한 스페이스의 편집 URL로 redirect (PageViewPage와 동일 패턴)
    return <Navigate to={`/spaces/${pageSpaceId}/pages/${pageId}/edit`} replace />;
  }

  const handleSave = async () => {
    // 본문 불변 보장 — 본문 미수정이면 직렬화 대신 원문 그대로 (버전 diff 노이즈 방지)
    const body = editorRef.current?.isDirty() ? editorRef.current.getMarkdown() : initialBody;
    try {
      if (isEdit && pageId) {
        const saved = await updatePage(pageId, { title, body });
        toast({ title: "페이지를 저장했습니다", appearance: "success" });
        await reloadPages();
        navigate(`/spaces/${spaceId}/pages/${saved.id}`);
      } else {
        const created = await createPage({ spaceId, parentId, title, body });
        toast({ title: `"${created.title}" 페이지를 만들었습니다`, appearance: "success" });
        await reloadPages();
        navigate(`/spaces/${spaceId}/pages/${created.id}`);
      }
    } catch (error) {
      toast({
        title: "저장 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const handleCancel = () => {
    // Task 5: dirty 이탈 가드
    if (isDirty() && !window.confirm("저장하지 않은 변경이 있습니다. 나가시겠습니까?")) {
      return;
    }
    if (isEdit) {
      navigate(`/spaces/${spaceId}/pages/${pageId}`); // 수정 취소 → 보기
    } else if (parentId) {
      navigate(`/spaces/${spaceId}/pages/${parentId}`); // 하위 생성 취소 → 부모 보기
    } else {
      navigate(`/spaces/${spaceId}`); // 루트 생성 취소 → 스페이스 인덱스
    }
  };

  return (
    <div className={`page-edit${width === "full" ? " page-edit--full" : ""}`}>
      <input
        className="page-edit-title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setTitleDirty(true); // Task 5: 제목 변경 감지
        }}
        placeholder="제목 없음"
        aria-label="페이지 제목"
      />
      <WikiEditor ref={editorRef} initialMarkdown={initialBody} pages={pages ?? []} />
      <div className="page-edit-actions">
        <Button onClick={handleSave} disabled={!title.trim()}>
          저장
        </Button>
        <Button variant="subtle" onClick={handleCancel}>
          취소
        </Button>
        {isEdit && pageId ? (
          <Button
            size="small"
            variant="subtle"
            aria-label="전체 너비"
            aria-pressed={width === "full"}
            onClick={toggleWidth}
          >
            {width === "full" ? "기본 너비" : "전체 너비"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
