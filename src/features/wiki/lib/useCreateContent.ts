import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { useToast } from "@chanho/react";
import type { PageTemplate, PageType } from "../store/types";
import { createPage, getCurrentUser, listSpaces } from "../store/wikiStore";
import { contentPathIn } from "./contentPath";
import { applyTemplateVariables, todayIso, type TemplateVariables } from "./templateVariables";

/** 새 초안의 임시 제목 — 편집 화면에서 바로 덮어쓰게 되어 있다. */
export const DRAFT_TITLE = "제목 없음";
/** 새 폴더의 임시 이름 — 폴더 화면에서 인라인으로 고친다(폴더는 편집 화면이 없다). */
export const FOLDER_TITLE = "제목 없는 폴더";
/** 새 블로그 글의 임시 제목(W24). */
export const BLOG_TITLE = "제목 없는 글";

/**
 * 템플릿 변수 값을 모은다(W27-1). 사용자·스페이스 조회가 실패해도 만들기를 막지 않는다 —
 * 이름 한 줄 때문에 문서를 못 만드는 것이 더 나쁘다. 그 변수만 빈칸으로 남는다.
 * 스페이스 이름은 `listSpaces()`에서 찾는다(스토어에 단건 조회가 없다).
 */
async function resolveTemplateVariables(spaceId: string): Promise<TemplateVariables> {
  const [user, spaces] = await Promise.all([
    getCurrentUser().catch(() => null),
    listSpaces().catch(() => []),
  ]);
  return {
    date: todayIso(),
    author: user?.name ?? "",
    space: spaces.find((s) => s.id === spaceId)?.name ?? "",
  };
}

/**
 * 새 콘텐츠(페이지 또는 폴더)를 **먼저 만들고** 해당 화면으로 보낸다.
 *
 * 예전에는 생성 버튼들이 `/pages/new`(아직 존재하지 않는 문서)로 이동만 해서, 저장하기 전까지
 * 사이드바 트리에 아무것도 나타나지 않았다 — 사용자가 "눌리긴 한 건가?"를 확인할 방법이 없었다.
 * 이제 초안(status: "draft")으로 즉시 만들어 트리에 `초안` 배지와 함께 세운다.
 *
 * 모든 생성 진입점(헤더 만들기·트리 행의 +·폴더 화면·스페이스 개요·사이드바 콘텐츠 +)이 이
 * 훅 하나를 쓴다 — 진입점마다 다르게 동작하면 "어디서 만들었냐"에 따라 트리에 보였다 안 보였다 한다.
 * 폴더 생성이 AppShell·FolderPage에 따로 복제돼 있었고, 그 탓에 헤더에서는 하위 폴더를 만들
 * 방법이 아예 없었다(parentId를 받지 않았다) — 그래서 타입을 인자로 받는 하나로 합쳤다.
 *
 * 페이지와 폴더는 만든 뒤 보내는 곳이 다르다. 폴더는 본문이 없어 입력받을 게 이름뿐이고,
 * 그 이름은 폴더 화면에서 인라인으로 고치는 게 캡처(`07-26-폴더2.png`)의 흐름이다 —
 * 그래서 편집 화면을 거치지 않고 폴더 화면으로 바로 보낸다.
 *
 * 되돌리기: 손대지 않은 초안은 편집 화면을 닫을 때 지운다(PageEditPage) — 그러지 않으면
 * 실수로 누른 만큼 "제목 없음"이 트리에 쌓인다.
 */
export function useCreateContent(
  spaceId: string | null,
  reloadPages: () => Promise<void>,
): {
  createContent: (type: PageType, parentId?: string | null) => Promise<void>;
  /**
   * 템플릿 본문으로 초안을 만든다 — 제목은 여전히 비워 둔다(그 템플릿의 모든 문서가 같은
   * 제목이면 곤란하다). 본문의 `{{date}}`·`{{author}}`·`{{space}}`는 여기서 치환된다.
   */
  createFromTemplate: (template: PageTemplate, parentId?: string | null) => Promise<void>;
  creating: boolean;
} {
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  const createContent = useCallback(
    async (type: PageType, parentId: string | null = null, template?: PageTemplate) => {
      if (!spaceId || creating) return;
      setCreating(true);
      try {
        // 변수 치환은 만들 때 한 번뿐이다 — 기본 템플릿과 스페이스 템플릿에 같은 규칙을 적용한다
        const body = template
          ? applyTemplateVariables(template.content, await resolveTemplateVariables(spaceId))
          : undefined;
        const created = await createPage({
          spaceId,
          // 블로그 글은 트리 밖이다 — 트리 행의 +에서 눌렀어도 부모를 주지 않는다(백엔드는 400)
          parentId: type === "blog" ? null : parentId,
          title: type === "folder" ? FOLDER_TITLE : type === "blog" ? BLOG_TITLE : DRAFT_TITLE,
          type,
          ...(template ? { body, icon: template.icon ?? undefined } : {}),
          // 폴더는 게시 개념이 없다 — 초안 상태를 주지 않는다(백엔드도 폴더는 published로 고정한다)
          ...(type === "folder" ? {} : { status: "draft" as const }),
        });
        // 트리가 새 항목을 바로 그리도록 이동 전에 갱신한다
        await reloadPages();
        navigate(
          type === "folder"
            ? contentPathIn(spaceId, created)
            : `/spaces/${spaceId}/pages/${created.id}/edit`,
        );
      } catch (error) {
        toast({
          title: type === "folder" ? "폴더 만들기 실패" : "만들기 실패",
          description: error instanceof Error ? error.message : String(error),
          appearance: "danger",
        });
      } finally {
        setCreating(false);
      }
    },
    [spaceId, creating, reloadPages, navigate, toast],
  );

  const createFromTemplate = useCallback(
    (template: PageTemplate, parentId: string | null = null) =>
      createContent("page", parentId, template),
    [createContent],
  );

  return { createContent, createFromTemplate, creating };
}
