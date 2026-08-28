import { useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ConfirmDialog, Dropdown, Lozenge, Radio, RadioGroup, useToast } from "@chanho/react";
import { ChevronRight, Copy, FileText, Folder, FolderInput, Link2, MoreHorizontal, Pencil, Plus, Star } from "lucide-react";
import { contentPathIn } from "../lib/contentPath";
import type { ReactNode } from "react";
import { MoveImpactError } from "../store/types";
import type { Page, PageNode, PageType, Space } from "../store/types";
import { copyPage, listPages, movePage, updatePage } from "../store/wikiStore";
import {
  descendantIdsOf,
  dropModeFor,
  resolveDrop,
  type DropMode,
  type FlatDropNode,
} from "./pageTreeDnd";
import { CreateContentMenu } from "./CreateContentMenu";
import { useStarredPages } from "../lib/starredPages";

export interface PageTreeProps {
  spaceId: string;
  /** 지금까지 로드한 노드(평면). 지연 트리라 "전부"가 아니다(2026-08-29). */
  pages: PageNode[];
  /** 펼쳐진 노드 id — 펼침이 곧 자식 로딩 트리거라 상태를 부모가 갖는다. */
  expanded: Set<string>;
  /** 펼치기/접기. 부모가 자식을 받아온다. */
  onToggle: (id: string) => void;
  /** 이동 다이얼로그의 "다른 스페이스" 후보 — 생략하면 현재 스페이스 안 이동만 가능 */
  spaces?: Space[];
  /** 드래그로 페이지를 이동한 뒤 호출 — 주어지지 않으면 드래그 비활성 */
  onMoved?: () => void | Promise<void>;
  /** 행의 "+" — 해당 항목의 하위 콘텐츠를 만든다(타입은 드롭다운에서 고른다).
   *  없으면 기존처럼 생성 화면으로 이동한다. */
  onCreateChild?: (type: PageType, parentId: string) => void | Promise<void>;
}

interface TreeNode {
  page: PageNode;
  children: TreeNode[];
}

/** 이동 다이얼로그용 — 전량을 읽어온 목록을 트리 노드 모양으로 맞춘다(자식 수는 그 목록에서 센다). */
function toPickerNode(all: Page[]): (page: Page) => PageNode {
  return (page) => ({
    id: page.id,
    parentId: page.parentId,
    title: page.title,
    type: page.type,
    status: page.status,
    position: page.position,
    icon: page.icon ?? null,
    updatedBy: page.updatedBy,
    updatedAt: page.updatedAt,
    childCount: all.filter((p) => p.parentId === page.id).length,
  });
}

/** parentId 인접 리스트 → 트리. 형제는 position 오름차순. 로드된 것만 들어온다. */
function buildTree(pages: PageNode[]): TreeNode[] {
  const byParent = new Map<string | null, PageNode[]>();
  for (const page of pages) {
    const siblings = byParent.get(page.parentId) ?? [];
    siblings.push(page);
    byParent.set(page.parentId, siblings);
  }
  const toNodes = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((page) => ({ page, children: toNodes(page.id) }));
  return toNodes(null);
}

interface FlatNode {
  page: PageNode;
  depth: number;
}

/** 화면에 보이는 순서대로 평탄화 — activeId의 자손은 제외(드래그 중 함께 이동하므로) */
function flattenVisible(
  roots: TreeNode[],
  expanded: Set<string>,
  activeId: string | null,
): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ page: node.page, depth });
      // 지연 트리 기본값은 접힘이다 — 펼친 노드의 자식만 보여준다(드래그 중인 노드 제외).
      const showChildren = node.page.id !== activeId && expanded.has(node.page.id);
      if (showChildren) walk(node.children, depth + 1);
    }
  };
  walk(roots, 0);
  return out;
}

/**
 * 드래그 가능한 트리 항목(li). useSortable의 attributes는 li에 role="button"을 붙여
 * 링크/트리 시맨틱을 해치므로 listeners만 스프레드한다(포인터 드래그 전용 — 스펙 4.1).
 */
function SortableRow({
  id,
  dropMode,
  children,
}: {
  id: string;
  /** 이 항목 위에 드롭하면 어떻게 되는지 — 시각 표시(앞/뒤 선, 하위 하이라이트) */
  dropMode: DropMode | null;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id });
  const classes = [
    isDragging ? "page-tree-dragging" : null,
    dropMode ? `page-tree-drop-${dropMode}` : null,
  ].filter(Boolean);
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={classes.length ? classes.join(" ") : undefined}
      {...listeners}
    >
      {children}
    </li>
  );
}

export function PageTree({ spaceId, pages, expanded, onToggle, spaces, onMoved, onCreateChild }: PageTreeProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  // 드래그 중 드롭 대상과 의도(앞/뒤/하위) — 시각 표시와 최종 이동이 같은 값을 쓴다
  const [dropIntent, setDropIntent] = useState<{ overId: string; mode: DropMode } | null>(null);
  // 이동 다이얼로그 대상 페이지 (null = 닫힘)
  const [moveTarget, setMoveTarget] = useState<PageNode | null>(null);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  // 스페이스 간 이동 — 대상 스페이스와 그 스페이스의 페이지 목록(부모 후보), 하위 처리 방식
  const [moveSpaceId, setMoveSpaceId] = useState<string>(spaceId);
  /**
   * 다른 스페이스로 이동할 때의 부모 후보. **여기만 아직 그 스페이스 전량을 읽는다**
   * (알려진 부채 2026-08-29) — 사용자가 다이얼로그를 열었을 때만 도는 경로라 우선순위를 뒤로 뒀다.
   */
  const [moveSpacePages, setMoveSpacePages] = useState<PageNode[] | null>(null);
  const [moveChildren, setMoveChildren] = useState<"with" | "promote">("with");
  // 인라인 이름 바꾸기 — 트리 행의 라벨이 입력으로 바뀐다(모달 아님, 노션/컨플식)
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const { starred: starredPageIds, toggle: toggleStar } = useStarredPages();
  // 드래그 직후 발화하는 클릭 억제 — 억제하지 않으면 드롭할 때 행의 NavLink 클릭이 살아나
  // 그 페이지로 이동해 버려 "구조만 바꿨는데 화면 전체가 리로딩"되는 것처럼 보인다.
  const suppressNavRef = useRef(false);
  const navigate = useNavigate();
  const toast = useToast();
  const roots = buildTree(pages);
  // 검색 필터 중에는 부분 트리라 위치 계산이 모호하므로 드래그를 끈다 (스펙 4.1)
  const dragEnabled = onMoved !== undefined;
  const flat = flattenVisible(roots, expanded, activeId);
  // 클릭(네비게이션)과 드래그 구분 — 6px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));


  const dropNodes = (): FlatDropNode[] =>
    flat.map((f) => ({ id: f.page.id, parentId: f.page.parentId, depth: f.depth }));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const { active, over } = event;
    if (!over || String(over.id) === String(active.id)) {
      setDropIntent(null);
      return;
    }
    const overId = String(over.id);
    // 자기 자손 위는 무효 — 표시도 하지 않는다(놓아도 아무 일 없음을 미리 보여준다)
    if (descendantIdsOf(dropNodes(), String(active.id)).has(overId)) {
      setDropIntent(null);
      return;
    }
    const activeRect = active.rect.current.translated;
    if (!activeRect) return;
    const pointerY = activeRect.top + activeRect.height / 2;
    setDropIntent({ overId, mode: dropModeFor(pointerY, over.rect.top, over.rect.height) });
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    const intent = dropIntent;
    setActiveId(null);
    setDropIntent(null);
    // 이 드래그의 pointerup이 만들 클릭 한 번을 무효화한다(클릭이 안 오는 경우 대비 타이머 해제)
    suppressNavRef.current = true;
    setTimeout(() => {
      suppressNavRef.current = false;
    }, 120);
    if (!over || !intent || intent.overId !== String(over.id)) return;
    const drop = resolveDrop(dropNodes(), String(active.id), intent.overId, intent.mode);
    if (!drop) return;
    try {
      if (!(await moveWithImpactConfirm(String(active.id), drop))) return; // 사용자가 취소
    } catch (error) {
      toast({
        title: "페이지 이동 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
      return;
    }
    // 이동은 이미 성공했으므로 리로드 실패를 이동 실패로 오표시하지 않는다
    try {
      await onMoved?.();
    } catch (error) {
      toast({
        title: "트리 새로고침 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  /**
   * 이동 실행 + W18 영향 확인 — 새 위치의 보기 제한이 새로 적용되면(MoveImpactError)
   * 어떤 제한이 적용되는지 보여주고 확인받은 뒤 confirmImpact로 재시도한다.
   * @returns 이동을 실행했으면 true, 사용자가 취소했으면 false
   */
  const moveWithImpactConfirm = async (
    id: string,
    target: Parameters<typeof movePage>[1],
  ): Promise<boolean> => {
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
  };

  /** 링크 복사 — 게이트웨이 뒤 실제 주소(base "/wiki" 포함)를 클립보드에 넣는다. */
  const handleCopyLink = async (page: PageNode) => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const url = `${window.location.origin}${base}${contentPathIn(spaceId, page)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "링크를 복사했습니다", appearance: "success" });
    } catch {
      toast({ title: "링크 복사에 실패했습니다", description: url, appearance: "danger" });
    }
  };

  /** 인라인 이름 확정 — 빈 제목이면 취소와 동일(원래 이름 유지). */
  const commitRename = async (page: PageNode) => {
    const next = renameValue.trim();
    setRenameId(null);
    if (!next || next === page.title || renaming) return;
    setRenaming(true);
    try {
      await updatePage(page.id, { title: next });
    } catch (e) {
      toast({
        title: "이름 바꾸기 실패",
        description: e instanceof Error ? e.message : undefined,
        appearance: "danger",
      });
      setRenaming(false);
      return;
    }
    setRenaming(false);
    try {
      await onMoved?.();
    } catch {
      /* 이름은 이미 바뀜 — 새로고침 실패는 다음 로드에서 해소된다 */
    }
  };

  const handleCopy = async (page: PageNode) => {
    try {
      const copy = await copyPage(page.id);
      toast({ title: `"${copy.title}"을(를) 만들었습니다`, appearance: "success" });
    } catch (error) {
      toast({
        title: "페이지 복제 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
      return;
    }
    try {
      await onMoved?.();
    } catch {
      /* 복제는 성공 — 새로고침 실패는 다음 로드에서 해소된다 */
    }
  };

  const handleMoveConfirm = async () => {
    if (!moveTarget) return;
    setMoving(true);
    try {
      const moved = await moveWithImpactConfirm(moveTarget.id, {
        parentId: moveParentId,
        ...(moveSpaceId !== spaceId ? { spaceId: moveSpaceId, children: moveChildren } : {}),
      });
      if (!moved) return; // 사용자가 영향 확인에서 취소 — 다이얼로그는 열어 둔다
      setMoveTarget(null);
      toast({ title: "페이지를 이동했습니다", appearance: "success" });
      await onMoved?.();
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

  const openMoveDialog = (page: PageNode) => {
    setMoveSpaceId(spaceId);
    setMoveSpacePages(null);
    setMoveChildren("with");
    setMoveParentId(page.parentId);
    setMoveTarget(page);
  };

  const changeMoveSpace = (nextSpaceId: string) => {
    setMoveSpaceId(nextSpaceId);
    setMoveParentId(null); // 스페이스가 바뀌면 이전 부모는 무의미 — 루트부터 다시 고른다
    if (nextSpaceId === spaceId) {
      setMoveSpacePages(null); // 현재 스페이스는 이미 가진 pages를 쓴다
      return;
    }
    setMoveSpacePages(null);
    void listPages(nextSpaceId).then((all) => setMoveSpacePages(all.map(toPickerNode(all))));
  };

  /** 이동 다이얼로그의 대상 부모 후보 — 자기 자신과 자손은 제외(순환) */
  const moveOptions = (page: PageNode): FlatNode[] => {
    if (moveSpaceId !== spaceId) {
      // 다른 스페이스 — 로드한 그 스페이스 트리 전체가 후보(자기 서브트리는 그 스페이스에 없다)
      if (moveSpacePages === null) return [];
      const allIds = new Set(moveSpacePages.map((p) => p.id));
      return flattenVisible(buildTree(moveSpacePages), allIds, null);
    }
    const excluded = descendantIdsOf(
      pages.map((p) => ({ id: p.id, parentId: p.parentId, depth: 0 })),
      page.id,
    );
    excluded.add(page.id);
    // 이동 대상 후보는 로드된 것 전부를 펼쳐 보여준다(접힘 상태와 무관).
    const allIds = new Set(pages.map((p) => p.id));
    return flattenVisible(roots, allIds, null).filter((f) => !excluded.has(f.page.id));
  };

  const renderNodes = (nodes: TreeNode[]) => (
    <ul className="page-tree-list">
      {nodes.map(({ page, children }) => {
        // 드래그 중인 노드의 자손은 임시로 접는다 (스펙 4.1) — flattenVisible의 제외와 일치,
        // 자손 위 드롭(무효)을 시각적으로도 차단한다
        const isExpanded = page.id !== activeId && expanded.has(page.id);
        const row = (
          <>
            <div className="page-tree-row">
              {/* 화살표는 서버가 준 childCount로 그린다 — 자식을 받아보기 전에도 알아야 한다 */}
              {page.childCount > 0 ? (
                <button
                  type="button"
                  className="page-tree-toggle"
                  aria-expanded={isExpanded}
                  aria-label={
                    isExpanded ? `${page.title} 하위 접기` : `${page.title} 하위 펼치기`
                  }
                  onClick={() => onToggle(page.id)}
                >
                  <ChevronRight className="page-tree-toggle-icon" size={14} aria-hidden="true" />
                </button>
              ) : (
                <span className="page-tree-toggle-spacer" aria-hidden="true" />
              )}
              {renameId === page.id ? (
                <span className="page-tree-rename">
                  {page.icon ? (
                    <span className="page-tree-emoji" aria-hidden="true">{page.icon}</span>
                  ) : page.type === "folder" ? (
                    <Folder className="page-tree-icon" size={16} aria-hidden="true" />
                  ) : (
                    <FileText className="page-tree-icon" size={16} aria-hidden="true" />
                  )}
                  <input
                    className="page-tree-rename-input"
                    aria-label={`${page.title} 이름 바꾸기`}
                    value={renameValue}
                    autoFocus
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(page);
                      if (e.key === "Escape") setRenameId(null);
                    }}
                    onBlur={() => void commitRename(page)}
                  />
                </span>
              ) : (
              <NavLink
                to={contentPathIn(spaceId, page)}
                onClick={(e) => {
                  if (suppressNavRef.current) {
                    e.preventDefault();
                    suppressNavRef.current = false;
                  }
                }}
              >
                {/* 폴더/문서 구분 — 아이콘만으로는 색약·저시력 사용자가 구분하기 어려우므로
                  * 접근 이름에도 "폴더"를 넣는다(WCAG 1.4.1 색·형태 단독 의존 금지). */}
                {page.icon ? (
                  <span className="page-tree-emoji" aria-hidden="true">{page.icon}</span>
                ) : page.type === "folder" ? (
                  <Folder className="page-tree-icon" size={16} aria-hidden="true" />
                ) : (
                  <FileText className="page-tree-icon" size={16} aria-hidden="true" />
                )}
                <span className="page-tree-label">{page.title}</span>
                {page.type === "folder" ? (
                  <span className="wiki-visually-hidden"> (폴더)</span>
                ) : null}
                {/* 아직 게시되지 않은 문서 — 캡처(07-26-편집구조_레이아웃.png)의 "초안" 배지.
                  * 링크의 접근 이름에 포함되므로 스크린리더에도 함께 읽힌다. */}
                {page.status === "draft" ? <Lozenge appearance="info">초안</Lozenge> : null}
              </NavLink>
              )}
              {/* NavLink의 형제 — 링크 안에 버튼 중첩 금지.
                * 하위로 폴더도 만들 수 있어야 해서 드롭다운으로 연다 — 전에는 페이지만 됐다. */}
              {onCreateChild ? (
                <CreateContentMenu
                  trigger={
                    <button
                      type="button"
                      className="page-tree-add"
                      aria-label={`${page.title} 하위 콘텐츠 추가`}
                    >
                      <Plus size={14} aria-hidden="true" />
                    </button>
                  }
                  onSelect={(type) => void onCreateChild(type, page.id)}
                />
              ) : (
                <button
                  type="button"
                  className="page-tree-add"
                  aria-label={`${page.title} 하위 페이지 추가`}
                  onClick={() => navigate(`/spaces/${spaceId}/pages/new?parent=${page.id}`)}
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
              )}
              {onMoved ? (
                <Dropdown
                  trigger={
                    <button
                      type="button"
                      className="page-tree-add"
                      aria-label={`${page.title} 더보기`}
                    >
                      <MoreHorizontal size={14} aria-hidden="true" />
                    </button>
                  }
                  items={[
                    {
                      label: "이름 바꾸기",
                      icon: <Pencil size={16} aria-hidden="true" />,
                      onSelect: () => {
                        // 드롭다운이 닫히며 트리거로 포커스를 되돌린 "뒤"에 입력을 마운트해야
                        // 한다 — 같은 틱에 마운트하면 포커스 복원이 입력을 blur시켜 즉시 닫힌다.
                        window.setTimeout(() => {
                          setRenameValue(page.title);
                          setRenameId(page.id);
                        }, 0);
                      },
                    },
                    {
                      label: "링크 복사",
                      icon: <Link2 size={16} aria-hidden="true" />,
                      onSelect: () => void handleCopyLink(page),
                    },
                    {
                      label: starredPageIds.includes(page.id) ? "별표 해제" : "별표 표시",
                      icon: (
                        <Star
                          size={16}
                          aria-hidden="true"
                          fill={starredPageIds.includes(page.id) ? "currentColor" : "none"}
                        />
                      ),
                      onSelect: () =>
                        toggleStar({
                          id: page.id,
                          spaceId,
                          title: page.title,
                          icon: page.icon,
                          type: page.type,
                        }),
                    },
                    {
                      label: "복제",
                      icon: <Copy size={16} aria-hidden="true" />,
                      onSelect: () => void handleCopy(page),
                    },
                    {
                      label: "이동…",
                      icon: <FolderInput size={16} aria-hidden="true" />,
                      onSelect: () => openMoveDialog(page),
                    },
                  ]}
                />
              ) : null}
            </div>
            {isExpanded && children.length > 0 ? renderNodes(children) : null}
          </>
        );
        return dragEnabled ? (
          <SortableRow
            key={page.id}
            id={page.id}
            dropMode={dropIntent?.overId === page.id ? dropIntent.mode : null}
          >
            {row}
          </SortableRow>
        ) : (
          <li key={page.id}>{row}</li>
        );
      })}
    </ul>
  );

  if (roots.length === 0) {
    return <p className="page-tree-empty">페이지 없음</p>;
  }
  return (
    <nav className="page-tree" aria-label="페이지 트리">
      {dragEnabled ? (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={flat.map((f) => f.page.id)}
            strategy={verticalListSortingStrategy}
          >
            {renderNodes(roots)}
          </SortableContext>
        </DndContext>
      ) : (
        renderNodes(roots)
      )}
      <ConfirmDialog
        open={moveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMoveTarget(null);
        }}
        title="페이지 이동"
        description={moveTarget ? `"${moveTarget.title}"을(를) 어디로 옮길까요?` : undefined}
        confirmLabel="이동"
        cancelLabel="취소"
        loading={moving}
        onConfirm={() => void handleMoveConfirm()}
      >
        {moveTarget ? (
          <div className="page-tree-move-form">
            {spaces && spaces.length > 1 ? (
              <select
                className="page-tree-move-select"
                aria-label="대상 스페이스"
                value={moveSpaceId}
                onChange={(e) => changeMoveSpace(e.target.value)}
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.id === spaceId ? " (현재)" : ""}
                  </option>
                ))}
              </select>
            ) : null}
            {moveSpaceId !== spaceId && moveSpacePages === null ? (
              <p className="page-tree-move-loading" role="status">대상 스페이스 페이지를 불러오는 중…</p>
            ) : (
              <select
                className="page-tree-move-select"
                aria-label="대상 위치"
                value={moveParentId ?? ""}
                onChange={(e) => setMoveParentId(e.target.value === "" ? null : e.target.value)}
              >
                <option value="">(맨 위)</option>
                {moveOptions(moveTarget).map((f) => (
                  <option key={f.page.id} value={f.page.id}>
                    {`${" ".repeat(f.depth * 2)}${f.page.title}`}
                  </option>
                ))}
              </select>
            )}
            {/* 자식 유무는 서버가 준 childCount로 판단한다 — 지연 트리에서는 아직 안 펼친
              * 가지의 자식이 로드돼 있지 않아, 로드된 목록으로 세면 선택지가 통째로 사라진다. */}
            {moveSpaceId !== spaceId && moveTarget.childCount > 0 ? (
              <RadioGroup
                aria-label="하위 항목 처리"
                value={moveChildren}
                onValueChange={(v: string) => setMoveChildren(v as "with" | "promote")}
              >
                <Radio value="with" label="하위 항목도 함께 이동" />
                <Radio value="promote" label="하위 항목은 현재 위치에 남기기 (한 단계 위로)" />
              </RadioGroup>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </nav>
  );
}
