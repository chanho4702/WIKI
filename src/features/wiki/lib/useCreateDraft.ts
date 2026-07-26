import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { useToast } from "@chanho/react";
import { createPage } from "../store/wikiStore";

/** 새 초안의 임시 제목 — 편집 화면에서 바로 덮어쓰게 되어 있다. */
export const DRAFT_TITLE = "제목 없음";

/**
 * 새 문서를 **먼저 만들고** 편집 화면으로 보낸다.
 *
 * 예전에는 생성 버튼들이 `/pages/new`(아직 존재하지 않는 문서)로 이동만 해서, 저장하기 전까지
 * 사이드바 트리에 아무것도 나타나지 않았다 — 사용자가 "눌리긴 한 건가?"를 확인할 방법이 없었다.
 * 이제 초안(status: "draft")으로 즉시 만들어 트리에 `초안` 배지와 함께 세운다.
 *
 * 모든 생성 진입점(헤더 만들기·트리 행의 +·폴더 화면·스페이스 개요·사이드바 콘텐츠 +)이 이
 * 훅 하나를 쓴다 — 진입점마다 다르게 동작하면 "어디서 만들었냐"에 따라 트리에 보였다 안 보였다 한다.
 *
 * 되돌리기: 손대지 않은 초안은 편집 화면을 닫을 때 지운다(PageEditPage) — 그러지 않으면
 * 실수로 누른 만큼 "제목 없음"이 트리에 쌓인다.
 */
export function useCreateDraft(
  spaceId: string | null,
  reloadPages: () => Promise<void>,
): { createDraft: (parentId?: string | null) => Promise<void>; creating: boolean } {
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const createDraft = useCallback(
    async (parentId: string | null = null) => {
      if (!spaceId || creating) return;
      setCreating(true);
      try {
        const created = await createPage({
          spaceId,
          parentId,
          title: DRAFT_TITLE,
          status: "draft",
        });
        // 트리가 새 초안을 바로 그리도록 이동 전에 갱신한다
        await reloadPages();
        navigate(`/spaces/${spaceId}/pages/${created.id}/edit`);
      } catch (error) {
        toast({
          title: "만들기 실패",
          description: error instanceof Error ? error.message : String(error),
          appearance: "danger",
        });
      } finally {
        setCreating(false);
      }
    },
    [spaceId, creating, reloadPages, navigate, toast],
  );

  return { createDraft, creating };
}
