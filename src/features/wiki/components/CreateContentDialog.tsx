import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ConfirmDialog, Radio, RadioGroup, TextField, useToast } from "@chanho/react";
import type { PageNode, PageType, Space } from "../store/types";
import { createPage, listChildren, searchPageTitles } from "../store/wikiStore";
import { contentPathIn } from "../lib/contentPath";
import { DRAFT_TITLE, FOLDER_TITLE } from "../lib/useCreateContent";

export interface CreateContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaces: Space[];
  /** 열 때의 기본 스페이스 — 스페이스 밖(홈·디렉토리)이면 null(첫 스페이스로 초기화). */
  defaultSpaceId: string | null;
  /** 열 때의 기본 타입 — 홈 헤더의 "페이지 만들기…"/"폴더 만들기…"가 미리 고른다. */
  defaultType?: PageType;
  /** 현재 스페이스에 만들었을 때 트리 갱신(AppShell.reloadPages). */
  reloadPages: () => Promise<void>;
}

/**
 * 위치 지정 만들기 다이얼로그 — 헤더 "만들기"의 상세 경로 (사용자 요청: "어디에 어떻게
 * 추가할지 상세 조건"). 타입(페이지/폴더) + 대상 스페이스 + 상위 위치 + 제목(선택)을 받아
 * 즉시 생성한다. 제목을 비우면 기존 즉시 생성 경로(useCreateContent)와 같은 초안 기본명.
 * 만든 뒤에는 그 흐름과 같은 곳으로 보낸다 — 페이지는 편집 화면, 폴더는 폴더 화면.
 */
export function CreateContentDialog({
  open,
  onOpenChange,
  spaces,
  defaultSpaceId,
  defaultType = "page",
  reloadPages,
}: CreateContentDialogProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [type, setType] = useState<PageType>(defaultType);
  const [spaceId, setSpaceId] = useState<string>(defaultSpaceId ?? spaces[0]?.id ?? "");
  const [parentId, setParentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // 대상 스페이스의 부모 후보 — 스페이스를 바꾸면 다시 불러온다(이동 다이얼로그와 같은 패턴)
  /**
   * 상위 위치 후보(2026-08-29) — 검색어가 없으면 그 스페이스의 최상위, 있으면 제목 검색 결과.
   * 예전에는 스페이스 전 페이지를 받아 계층 select를 만들었는데 그 조회가 규모 상한이었다.
   */
  const [candidates, setCandidates] = useState<PageNode[] | null>(null);
  const [parentQuery, setParentQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // 열릴 때마다 기본값으로 초기화 — 지난번 입력이 남아 있으면 엉뚱한 위치에 만든다
  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setSpaceId(defaultSpaceId ?? spaces[0]?.id ?? "");
    setParentId(null);
    setParentQuery("");
    setTitle("");
  }, [open, defaultType, defaultSpaceId, spaces]);

  useEffect(() => {
    if (!open || !spaceId) return;
    let cancelled = false;
    const q = parentQuery.trim();
    const timer = setTimeout(() => {
      const fetching = q.length === 0 ? listChildren(spaceId, null) : searchPageTitles(spaceId, q);
      void fetching
        .then((found) => {
          if (!cancelled) setCandidates(found);
        })
        .catch(() => {
          if (!cancelled) setCandidates([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, spaceId, parentQuery]);

  const handleConfirm = async () => {
    if (!spaceId || creating) return;
    setCreating(true);
    try {
      const created = await createPage({
        spaceId,
        parentId,
        title: title.trim() || (type === "folder" ? FOLDER_TITLE : DRAFT_TITLE),
        type,
        // 폴더는 게시 개념이 없다 — useCreateContent와 같은 규칙
        ...(type === "folder" ? {} : { status: "draft" as const }),
      });
      onOpenChange(false);
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
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="새 콘텐츠 만들기"
      confirmLabel="만들기"
      cancelLabel="취소"
      loading={creating}
      onConfirm={() => void handleConfirm()}
    >
      <div className="create-content-form">
        <RadioGroup
          aria-label="콘텐츠 타입"
          value={type}
          onValueChange={(v: string) => setType(v as PageType)}
        >
          <Radio value="page" label="페이지" />
          <Radio value="folder" label="폴더" />
        </RadioGroup>
        <TextField
          label={type === "folder" ? "폴더 이름 (비우면 기본 이름)" : "제목 (비우면 초안 기본명)"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        {spaces.length > 1 ? (
          <select
            className="page-tree-move-select"
            aria-label="대상 스페이스"
            value={spaceId}
            onChange={(e) => {
              setSpaceId(e.target.value);
              setParentId(null);
            }}
          >
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
        <TextField
          label="상위 위치 검색"
          value={parentQuery}
          onChange={(e) => setParentQuery(e.target.value)}
          placeholder="제목으로 검색 (비우면 최상위 문서)"
        />
        {candidates === null ? (
          <p className="page-tree-move-loading" role="status">
            상위 위치를 불러오는 중…
          </p>
        ) : (
          <select
            className="page-tree-move-select"
            aria-label="상위 위치"
            value={parentId ?? ""}
            onChange={(e) => setParentId(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">(맨 위)</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </ConfirmDialog>
  );
}
