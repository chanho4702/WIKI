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
import { ChevronRight, Copy, FileText, Folder, FolderInput, MoreHorizontal, Plus } from "lucide-react";
import { contentPathIn } from "../lib/contentPath";
import type { ReactNode } from "react";
import type { Page, PageType, Space } from "../store/types";
import { copyPage, listPages, movePage } from "../store/wikiStore";
import {
  descendantIdsOf,
  dropModeFor,
  resolveDrop,
  type DropMode,
  type FlatDropNode,
} from "./pageTreeDnd";
import { CreateContentMenu } from "./CreateContentMenu";

export interface PageTreeProps {
  spaceId: string;
  pages: Page[];
  /** 이동 다이얼로그의 "다른 스페이스" 후보 — 생략하면 현재 스페이스 안 이동만 가능 */
  spaces?: Space[];
  /** true면 접힘 상태를 무시하고 전부 펼친다(검색 중) — 접기 토글도 숨긴다 */
  forceExpand?: boolean;
  /** 드래그로 페이지를 이동한 뒤 호출 — 주어지지 않으면 드래그 비활성 */
  onMoved?: () => void | Promise<void>;
  /** 행의 "+" — 해당 항목의 하위 콘텐츠를 만든다(타입은 드롭다운에서 고른다).
   *  없으면 기존처럼 생성 화면으로 이동한다. */
  onCreateChild?: (type: PageType, parentId: string) => void | Promise<void>;
}

interface TreeNode {
  page: Page;
  children: TreeNode[];
}

/** parentId 인접 리스트 → 트리. 형제는 position 오름차순. */
function buildTree(pages: Page[]): TreeNode[] {
  const byParent = new Map<string | null, Page[]>();
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
  page: Page;
  depth: number;
}

/** 화면에 보이는 순서대로 평탄화 — activeId의 자손은 제외(드래그 중 함께 이동하므로) */
function flattenVisible(
  roots: TreeNode[],
  collapsed: Set<string>,
  forceExpand: boolean,
  activeId: string | null,
): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      out.push({ page: node.page, depth });
      const hideChildren =
        node.page.id === activeId || (!forceExpand && collapsed.has(node.page.id));
      if (!hideChildren) walk(node.children, depth + 1);
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

export function PageTree({ spaceId, pages, spaces, forceExpand = false, onMoved, onCreateChild }: PageTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  // 드래그 중 드롭 대상과 의도(앞/뒤/하위) — 시각 표시와 최종 이동이 같은 값을 쓴다
  const [dropIntent, setDropIntent] = useState<{ overId: string; mode: DropMode } | null>(null);
  // 이동 다이얼로그 대상 페이지 (null = 닫힘)
  const [moveTarget, setMoveTarget] = useState<Page | null>(null);
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  // 스페이스 간 이동 — 대상 스페이스와 그 스페이스의 페이지 목록(부모 후보), 하위 처리 방식
  const [moveSpaceId, setMoveSpaceId] = useState<string>(spaceId);
  const [moveSpacePages, setMoveSpacePages] = useState<Page[] | null>(null);
  const [moveChildren, setMoveChildren] = useState<"with" | "promote">("with");
  // 드래그 직후 발화하는 클릭 억제 — 억제하지 않으면 드롭할 때 행의 NavLink 클릭이 살아나
  // 그 페이지로 이동해 버려 "구조만 바꿨는데 화면 전체가 리로딩"되는 것처럼 보인다.
  const suppressNavRef = useRef(false);
  const navigate = useNavigate();
  const toast = useToast();
  const roots = buildTree(pages);
  // 검색 필터 중에는 부분 트리라 위치 계산이 모호하므로 드래그를 끈다 (스펙 4.1)
  const dragEnabled = !forceExpand && onMoved !== undefined;
  const flat = flattenVisible(roots, collapsed, forceExpand, activeId);
  // 클릭(네비게이션)과 드래그 구분 — 6px 이상 움직여야 드래그 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
      await movePage(String(active.id), drop);
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

  const handleCopy = async (page: Page) => {
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
      await movePage(moveTarget.id, {
        parentId: moveParentId,
        ...(moveSpaceId !== spaceId ? { spaceId: moveSpaceId, children: moveChildren } : {}),
      });
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

  const openMoveDialog = (page: Page) => {
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
    void listPages(nextSpaceId).then(setMoveSpacePages);
  };

  /** 이동 다이얼로그의 대상 부모 후보 — 자기 자신과 자손은 제외(순환) */
  const moveOptions = (page: Page): FlatNode[] => {
    if (moveSpaceId !== spaceId) {
      // 다른 스페이스 — 로드한 그 스페이스 트리 전체가 후보(자기 서브트리는 그 스페이스에 없다)
      if (moveSpacePages === null) return [];
      return flattenVisible(buildTree(moveSpacePages), new Set(), true, null);
    }
    const excluded = descendantIdsOf(
      pages.map((p) => ({ id: p.id, parentId: p.parentId, depth: 0 })),
      page.id,
    );
    excluded.add(page.id);
    return flattenVisible(roots, new Set(), true, null).filter((f) => !excluded.has(f.page.id));
  };

  const renderNodes = (nodes: TreeNode[]) => (
    <ul className="page-tree-list">
      {nodes.map(({ page, children }) => {
        // 드래그 중인 노드의 자손은 임시로 접는다 (스펙 4.1) — flattenVisible의 제외와 일치,
        // 자손 위 드롭(무효)을 시각적으로도 차단한다
        const isCollapsed =
          page.id === activeId || (!forceExpand && collapsed.has(page.id));
        const row = (
          <>
            <div className="page-tree-row">
              {children.length > 0 && !forceExpand ? (
                <button
                  type="button"
                  className="page-tree-toggle"
                  aria-expanded={!isCollapsed}
                  aria-label={
                    isCollapsed ? `${page.title} 하위 펼치기` : `${page.title} 하위 접기`
                  }
                  onClick={() => toggle(page.id)}
                >
                  <ChevronRight className="page-tree-toggle-icon" size={14} aria-hidden="true" />
                </button>
              ) : (
                <span className="page-tree-toggle-spacer" aria-hidden="true" />
              )}
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
                {page.type === "folder" ? (
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
            {children.length > 0 && !isCollapsed ? renderNodes(children) : null}
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
            {moveSpaceId !== spaceId && pages.some((p) => p.parentId === moveTarget.id) ? (
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
