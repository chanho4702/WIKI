import { useEffect, useState } from "react";
import { Checkbox, ConfirmDialog, Radio, RadioGroup, useToast } from "@chanho/react";
import { MoveImpactError } from "../store/types";
import type { PageNode, Space } from "../store/types";
import { copyPage, listChildren, listDescendants, listSpaces, movePage, searchPageTitles } from "../store/wikiStore";

/**
 * 문서 이동·복제 대화상자 — 트리 행 메뉴와 문서 보기의 "⋯" 메뉴(F-02)가 같은 것을 연다.
 * 한쪽에만 고친 대화상자가 생기지 않게 상태·검증·영향 확인을 이 모듈 하나에 둔다.
 */

/** 대화상자가 필요로 하는 문서 정보 — 트리 노드(PageNode)와 보기 화면의 Page 둘 다 넘길 수 있다. */
export interface MoveCopySubject {
  id: string;
  title: string;
  parentId: string | null;
  childCount: number;
}

/**
 * 이동 실행 + W18 영향 확인 — 새 위치의 보기 제한이 새로 적용되면(MoveImpactError)
 * 어떤 제한이 적용되는지 보여주고 확인받은 뒤 confirmImpact로 재시도한다.
 * @returns 이동을 실행했으면 true, 사용자가 취소했으면 false
 */
export async function moveWithImpactConfirm(
  id: string,
  target: Parameters<typeof movePage>[1],
): Promise<boolean> {
  try {
    await movePage(id, target);
    return true;
  } catch (error) {
    if (!(error instanceof MoveImpactError)) throw error;
    const titles = error.newlyRestrictedBy.map((i) => `"${i.pageTitle}"`).join(", ");
    const ok = window.confirm(
      `이동하면 상위 ${titles}의 보기 제한이 새로 적용되어 접근 범위가 좁아질 수 있습니다. 계속할까요?`,
    );
    if (!ok) return false;
    await movePage(id, { ...target, confirmImpact: true });
    return true;
  }
}

export interface CopyPageDialogProps {
  /** 복제할 문서. null이면 닫힘. */
  page: MoveCopySubject | null;
  onClose: () => void;
  /** 복제 성공 뒤(트리 새로고침 등). 실패는 대화상자가 알린다. */
  onCopied?: (copy: { id: string; title: string }) => void | Promise<void>;
}

/** 복제는 옵션이 있어 한 번 물어본다 — 하위까지 복사하는지는 결과가 크게 달라지는 선택이다. */
export function CopyPageDialog({ page, onClose, onCopied }: CopyPageDialogProps) {
  const toast = useToast();
  const [includeDescendants, setIncludeDescendants] = useState(false);
  const [includeRestrictions, setIncludeRestrictions] = useState(true);
  const [copying, setCopying] = useState(false);

  // 열 때마다 기본값 — 지난 복제의 선택이 다음 복제에 조용히 남으면 안 된다. 호출부가 렌더마다 새 객체를
  // 넘겨도 다시 초기화하지 않게 "어느 문서가 열렸나"(id)에만 반응한다.
  const openId = page?.id ?? null;
  useEffect(() => {
    if (openId !== null) {
      setIncludeDescendants(false);
      setIncludeRestrictions(true);
    }
  }, [openId]);

  const confirm = async () => {
    if (!page) return;
    setCopying(true);
    let copy: { id: string; title: string };
    try {
      copy = await copyPage(page.id, { includeDescendants, includeRestrictions });
    } catch (error) {
      toast({
        title: "페이지 복제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
      return;
    } finally {
      setCopying(false);
    }
    onClose();
    toast({ title: `"${copy.title}"을(를) 만들었습니다`, appearance: "success" });
    try {
      await onCopied?.(copy);
    } catch {
      /* 복제는 성공 — 새로고침 실패는 다음 로드에서 해소된다 */
    }
  };

  return (
    <ConfirmDialog
      open={page !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="페이지 복제"
      description={page ? `"${page.title}"을(를) 복제합니다.` : undefined}
      confirmLabel="복제"
      cancelLabel="취소"
      loading={copying}
      onConfirm={() => void confirm()}
    >
      <div className="page-tree-copy-form">
        {page && page.childCount > 0 ? (
          <Checkbox
            label="하위 문서도 함께 복제"
            checked={includeDescendants}
            onCheckedChange={(next) => setIncludeDescendants(next === true)}
          />
        ) : null}
        {/* 기본은 켜 둔다 — 제한된 문서의 사본이 열려 있으면 복제 한 번으로 내용이 열린다 */}
        <Checkbox
          label="제한도 함께 복제"
          checked={includeRestrictions}
          onCheckedChange={(next) => setIncludeRestrictions(next === true)}
        />
      </div>
    </ConfirmDialog>
  );
}

export interface MovePageDialogProps {
  /** 옮길 문서. null이면 닫힘. */
  page: MoveCopySubject | null;
  /** 문서가 지금 속한 스페이스 */
  spaceId: string;
  /** "다른 스페이스" 후보. 생략하면 대화상자가 직접 읽는다. */
  spaces?: Space[];
  /**
   * 대상 위치에서 뺄 id(자기 자손) — 트리는 로드한 노드로 계산해 넘긴다. 생략하면 대화상자가
   * 서버 후손 목록으로 계산한다. 어느 쪽이든 순환의 최종 거부는 서버 몫이다.
   */
  excludeIds?: Set<string>;
  onClose: () => void;
  /** 이동 성공 뒤. 대상 스페이스를 함께 준다(스페이스를 옮겼으면 화면이 따라가야 한다). */
  onMoved?: (target: { spaceId: string; parentId: string | null }) => void | Promise<void>;
}

/**
 * 이동 대상 위치 후보는 대상 스페이스의 **최상위 + 제목 검색 결과**다(2026-08-29) — 지연 트리에서는
 * 스페이스 전 페이지 목록이 없고, 전량 조회 자체가 규모 상한이다.
 */
export function MovePageDialog({ page, spaceId, spaces, excludeIds, onClose, onMoved }: MovePageDialogProps) {
  const toast = useToast();
  const [moving, setMoving] = useState(false);
  const [targetSpaceId, setTargetSpaceId] = useState(spaceId);
  const [parentId, setParentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<PageNode[] | null>(null);
  const [children, setChildren] = useState<"with" | "promote">("with");
  const [loadedSpaces, setLoadedSpaces] = useState<Space[] | null>(null);
  const [fetchedExcluded, setFetchedExcluded] = useState<Set<string>>(new Set());
  const spaceOptions = spaces ?? loadedSpaces ?? [];

  const openId = page?.id ?? null;
  useEffect(() => {
    if (!page) return;
    setTargetSpaceId(spaceId);
    setChildren("with");
    setParentId(page.parentId);
    setQuery("");
    setCandidates(null);
    setFetchedExcluded(new Set());
    let cancelled = false;
    if (!spaces) {
      void listSpaces()
        .then((found) => {
          if (!cancelled) setLoadedSpaces(found);
        })
        .catch(() => {
          if (!cancelled) setLoadedSpaces([]); // 다른 스페이스로 못 옮길 뿐 이동 자체는 된다
        });
    }
    if (!excludeIds && page.childCount > 0) {
      void listDescendants(page.id)
        .then((found) => {
          if (!cancelled) setFetchedExcluded(new Set(found.map((n) => n.id)));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // 열 때(열린 문서가 바뀔 때)만 초기화한다 — 호출부가 렌더마다 새 객체를 넘길 수 있다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  // 대상 위치 후보 — 검색어가 없으면 그 스페이스의 최상위, 있으면 제목 검색 결과
  useEffect(() => {
    if (openId === null) return;
    let cancelled = false;
    const q = query.trim();
    const timer = setTimeout(() => {
      const fetching = q.length === 0 ? listChildren(targetSpaceId, null) : searchPageTitles(targetSpaceId, q);
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
  }, [openId, targetSpaceId, query]);

  const options = (subject: MoveCopySubject): PageNode[] => {
    const list = candidates ?? [];
    if (targetSpaceId !== spaceId) return list;
    const excluded = new Set(excludeIds ?? fetchedExcluded);
    excluded.add(subject.id);
    return list.filter((c) => !excluded.has(c.id));
  };

  const changeSpace = (next: string) => {
    setTargetSpaceId(next);
    setParentId(null); // 스페이스가 바뀌면 이전 부모는 무의미 — 최상위부터 다시 고른다
    setQuery("");
    setCandidates(null);
  };

  const confirm = async () => {
    if (!page) return;
    setMoving(true);
    try {
      const moved = await moveWithImpactConfirm(page.id, {
        parentId,
        ...(targetSpaceId !== spaceId ? { spaceId: targetSpaceId, children } : {}),
      });
      if (!moved) return; // 사용자가 영향 확인에서 취소 — 대화상자는 열어 둔다
      onClose();
      toast({ title: "페이지를 이동했습니다", appearance: "success" });
      await onMoved?.({ spaceId: targetSpaceId, parentId });
    } catch (error) {
      toast({
        title: "페이지 이동 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setMoving(false);
    }
  };

  return (
    <ConfirmDialog
      open={page !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="페이지 이동"
      description={page ? `"${page.title}"을(를) 어디로 옮길까요?` : undefined}
      confirmLabel="이동"
      cancelLabel="취소"
      loading={moving}
      onConfirm={() => void confirm()}
    >
      {page ? (
        <div className="page-tree-move-form">
          {spaceOptions.length > 1 ? (
            <select
              className="page-tree-move-select"
              aria-label="대상 스페이스"
              value={targetSpaceId}
              onChange={(e) => changeSpace(e.target.value)}
            >
              {spaceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.id === spaceId ? " (현재)" : ""}
                </option>
              ))}
            </select>
          ) : null}
          {candidates === null ? (
            <p className="page-tree-move-loading" role="status">대상 위치를 불러오는 중…</p>
          ) : (
            <select
              className="page-tree-move-select"
              aria-label="대상 위치"
              value={parentId ?? ""}
              onChange={(e) => setParentId(e.target.value === "" ? null : e.target.value)}
            >
              <option value="">(맨 위)</option>
              {options(page).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.title}
                </option>
              ))}
            </select>
          )}
          {/* 자식 유무는 서버가 준 childCount로 판단한다 — 지연 트리에서는 아직 안 펼친
            * 가지의 자식이 로드돼 있지 않아, 로드된 목록으로 세면 선택지가 통째로 사라진다. */}
          {targetSpaceId !== spaceId && page.childCount > 0 ? (
            <RadioGroup
              aria-label="하위 항목 처리"
              value={children}
              onValueChange={(v: string) => setChildren(v as "with" | "promote")}
            >
              <Radio value="with" label="하위 항목도 함께 이동" />
              <Radio value="promote" label="하위 항목은 현재 위치에 남기기 (한 단계 위로)" />
            </RadioGroup>
          ) : null}
        </div>
      ) : null}
    </ConfirmDialog>
  );
}
