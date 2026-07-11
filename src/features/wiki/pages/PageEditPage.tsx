import { useEffect, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { Button, Spinner, Tabs, TextArea, TextField, useToast } from "@chanho/react";
import { createPage, getPage, updatePage } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/WikiLayout";
import { MarkdownView } from "../components/MarkdownView";

/**
 * 페이지 편집 화면 — 생성(/pages/new?parent=<id|없음>)과 수정(/pages/:pageId/edit) 공용.
 * 제목 TextField + 작성/미리보기 Tabs + 저장/취소.
 */
export function PageEditPage() {
  const { spaceId, pageId } = useParams();
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get("parent"); // 생성 모드 전용 — 없으면 루트에 생성
  const navigate = useNavigate();
  const toast = useToast();
  const { reloadPages } = useOutletContext<WikiOutletContext>();
  const isEdit = pageId !== undefined;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  // 수정 모드는 기존 내용을 불러온 뒤에 입력 가능
  const [ready, setReady] = useState(!isEdit);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!isEdit || !pageId) return;
    void getPage(pageId).then((page) => {
      if (page === null) {
        setNotFound(true);
      } else {
        setTitle(page.title);
        setBody(page.body);
      }
      setReady(true);
    });
  }, [isEdit, pageId]);

  if (!spaceId) {
    // 라우팅상 도달 불가 — 타입 좁히기용 가드
    return <Navigate to="/" replace />;
  }
  if (!ready) {
    return <Spinner label="페이지 로딩 중" />;
  }
  if (notFound) {
    return <p>페이지를 찾을 수 없습니다</p>;
  }

  const handleSave = async () => {
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
    if (isEdit) {
      navigate(`/spaces/${spaceId}/pages/${pageId}`); // 수정 취소 → 보기
    } else if (parentId) {
      navigate(`/spaces/${spaceId}/pages/${parentId}`); // 하위 생성 취소 → 부모 보기
    } else {
      navigate(`/spaces/${spaceId}`); // 루트 생성 취소 → 스페이스 인덱스
    }
  };

  return (
    <div className="page-edit">
      <TextField
        label="제목"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="페이지 제목"
      />
      <Tabs
        label="본문 편집"
        items={[
          {
            value: "write",
            label: "작성",
            content: (
              <TextArea
                label="본문"
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="마크다운으로 작성하세요"
              />
            ),
          },
          {
            value: "preview",
            label: "미리보기",
            content: <MarkdownView markdown={body} />,
          },
        ]}
      />
      <div className="page-edit-actions">
        <Button onClick={handleSave} disabled={!title.trim()}>
          저장
        </Button>
        <Button variant="subtle" onClick={handleCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
