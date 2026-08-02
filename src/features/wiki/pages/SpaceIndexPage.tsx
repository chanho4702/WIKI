import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { Avatar, Button, EmptyState } from "@chanho/react";
import { ChevronRight, FileText, Folder, FolderOpen, Plus } from "lucide-react";
import type { Page, User } from "../store/types";
import { listUsers } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { displayUserName } from "../lib/userName";
import { contentPathIn } from "../lib/contentPath";
import { useCreateContent } from "../lib/useCreateContent";
import { CreateContentMenu } from "../components/CreateContentMenu";

/** 최근 업데이트 목록에 보여줄 최대 개수 — 캡처(특정 스페이스 페이지.png)의 5건 + "더 보기" 없이 고정. */
const RECENT_LIMIT = 8;

interface TreeNode {
  page: Page;
  children: TreeNode[];
}

/**
 * parentId 계층을 중첩 노드로 변환한다(형제는 position 순). PageTree.tsx의 toNodes와 같은 규칙이지만
 * 이쪽은 사이드바가 아니라 본문 목록용이라 DnD/접힘 상태 없이 순수 구조만 만든다.
 * 고아 페이지(부모가 삭제됐거나 다른 스페이스인 경우)는 루트로 끌어올려 목록에서 사라지지 않게 한다.
 */
function buildTree(pages: Page[]): TreeNode[] {
  const ids = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, Page[]>();
  for (const page of pages) {
    // 부모 id가 이 스페이스에 없으면 루트 취급 — 조용히 누락시키지 않는다
    const key = page.parentId !== null && ids.has(page.parentId) ? page.parentId : null;
    const list = byParent.get(key);
    if (list) list.push(page);
    else byParent.set(key, [page]);
  }

  const build = (parentId: string | null, seen: Set<string>): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .filter((page) => !seen.has(page.id)) // 순환 데이터 방어(parentId 사이클)
      .map((page) => {
        seen.add(page.id);
        return { page, children: build(page.id, seen) };
      });

  return build(null, new Set());
}

/** 하위 페이지 총합(자기 자신 제외) — 폴더 항목의 "N개 항목" 표기용. */
function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

interface ContentTreeProps {
  nodes: TreeNode[];
  spaceId: string;
  depth?: number;
}

/**
 * 본문 콘텐츠 트리 — 자식이 있는 페이지는 폴더 아이콘(열림)으로, 말단은 문서 아이콘으로 구분한다.
 * 컨플루언스의 "콘텐츠" 트리처럼 스페이스 전체 구조가 한 화면에 펼쳐진 상태로 보이는 것이 목적이라
 * 접기 토글을 두지 않는다(탐색은 사이드바 트리가, 조망은 이 화면이 담당).
 */
function ContentTree({ nodes, spaceId, depth = 0 }: ContentTreeProps) {
  return (
    <ul className="space-overview-tree" data-depth={depth}>
      {nodes.map((node) => {
        // 아이콘은 "폴더 타입인가"로, 개수 표기는 "자식이 있는가"로 갈린다 — 하위 페이지를 가진
        // 일반 페이지도 개수는 알려주되 폴더로 오인시키지 않는다.
        const isFolder = node.page.type === "folder";
        const hasChildren = node.children.length > 0;
        return (
          <li key={node.page.id} className="space-overview-tree-item">
            <Link to={contentPathIn(spaceId, node.page)} className="space-overview-tree-link">
              {isFolder ? (
                <FolderOpen className="space-overview-tree-icon" size={16} aria-hidden="true" />
              ) : (
                <FileText className="space-overview-tree-icon" size={16} aria-hidden="true" />
              )}
              <span className="space-overview-tree-label">{node.page.title}</span>
              {isFolder ? <span className="wiki-visually-hidden"> (폴더)</span> : null}
              {hasChildren ? (
                // 색·아이콘만이 아니라 텍스트로도 하위가 있음을 전달한다(WCAG 1.4.1)
                <span className="space-overview-tree-count">{countDescendants(node)}개 항목</span>
              ) : null}
            </Link>
            {hasChildren ? (
              <ContentTree nodes={node.children} spaceId={spaceId} depth={depth + 1} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** "2026년 7월 10일" — PageViewPage.formatDate와 같은 규칙(빈 값/무효 날짜는 빈 문자열). */
function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * 스페이스 개요 (`/spaces/:spaceId`) — 캡처(`특정 스페이스 페이지.png`)의 스페이스 홈에 해당한다.
 *
 * 이전에는 이 라우트가 첫 루트 페이지로 곧장 redirect해서 스페이스의 콘텐츠 구조를 조망할 화면이
 * 아예 없었다. 이제 "콘텐츠"(전체 계층 트리)와 "최근 업데이트"를 보여준다 — 사이드바 트리가
 * 탐색용이라면 이 화면은 조망용이다.
 *
 * 페이지가 하나도 없으면 기존과 동일하게 "첫 페이지 만들기" EmptyState를 유지한다.
 */
export function SpaceIndexPage() {
  const { spaceId } = useParams();
  const { pages, space, reloadPages } = useOutletContext<WikiOutletContext>();
  const [users, setUsers] = useState<User[]>([]);
  const { createContent } = useCreateContent(spaceId ?? null, reloadPages);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  if (pages === null) {
    return (
      <div className="space-overview">
        <span className="wiki-visually-hidden" role="status">
          스페이스 로딩 중
        </span>
        <div className="page-view-skeleton" aria-hidden="true">
          <span className="wiki-skeleton page-view-skeleton-title" />
          <div className="page-view-skeleton-body">
            {["70%", "55%", "62%", "48%"].map((width, i) => (
              <span key={i} className="wiki-skeleton wiki-skeleton-line" style={{ width }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (pages.length === 0) {
    return (
      <div className="empty-pages">
        <EmptyState
          title="아직 페이지가 없습니다"
          description="첫 페이지를 만들어 위키를 시작하세요."
          primaryAction={{
            label: "첫 페이지 만들기",
            onClick: () => void createContent("page"),
          }}
        />
      </div>
    );
  }

  const tree = buildTree(pages);
  const recent = pages
    .slice()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, RECENT_LIMIT);

  return (
    <div className="space-overview">
      <header className="space-overview-header">
        <Avatar name={space.name} color="auto" size="large" aria-hidden="true" />
        <div className="space-overview-heading">
          <h1>{space.name}</h1>
          <p className="space-overview-key">{space.key}</p>
        </div>
        {/* 스페이스 개요에서도 폴더를 만들 수 있어야 한다 — 전에는 페이지 전용 버튼이었다.
          * 이름이 "만들기"가 아닌 이유: 셸 헤더에 같은 이름의 버튼이 이미 있어 한 화면에 동명
          * 버튼이 둘이 되면 스크린리더에서 구분되지 않는다. */}
        <CreateContentMenu
          trigger={
            <Button size="small" iconBefore={<Plus size={16} aria-hidden="true" />}>
              새 콘텐츠
            </Button>
          }
          onSelect={(type) => void createContent(type)}
        />
      </header>

      {/* 사이드바에도 aria-label="콘텐츠" 섹션이 있다 — 같은 이름의 랜드마크가 둘이면 스크린리더
        * 목록에서 구분이 안 되므로 본문 쪽은 "스페이스 콘텐츠"로 이름을 달리한다. */}
      <section className="space-overview-section" aria-label="스페이스 콘텐츠">
        <h2 className="space-overview-section-title">
          <Folder size={16} aria-hidden="true" />
          스페이스 콘텐츠
        </h2>
        <ContentTree nodes={tree} spaceId={space.id} />
      </section>

      <section className="space-overview-section" aria-label="최근 업데이트">
        <h2 className="space-overview-section-title">
          <ChevronRight size={16} aria-hidden="true" />
          최근 업데이트
        </h2>
        <ul className="space-overview-recent">
          {recent.map((page) => {
            // 작성자 이름을 못 찾으면 `사용자 #{id}` 폴백(백엔드 모드에서 users가 비는 경우) — 설계 §9
            const editor = users.find((u) => u.id === page.updatedBy);
            const editorName = editor?.name ?? (page.updatedBy ? displayUserName(page.updatedBy) : null);
            const updated = formatDate(page.updatedAt);
            return (
              <li key={page.id} className="space-overview-recent-item">
                <Link to={contentPathIn(space.id, page)} className="space-overview-recent-link">
                  {/* 아이콘이 콘텐츠 트리와 달라지면 같은 항목이 화면마다 다른 종류로 보인다 */}
                  {page.type === "folder" ? (
                    <Folder size={16} aria-hidden="true" />
                  ) : (
                    <FileText size={16} aria-hidden="true" />
                  )}
                  <span>{page.title}</span>
                  {page.type === "folder" ? (
                    <span className="wiki-visually-hidden"> (폴더)</span>
                  ) : null}
                </Link>
                {/* 백엔드 모드에선 시각·작성자가 비어 올 수 있다 — 둘 다 없으면 메타 줄을 숨긴다.
                  * relativeTime은 7일이 지나면 절대일자를 돌려주므로 여기선 쓰지 않는다(중복 표기). */}
                {updated || editorName ? (
                  <p className="space-overview-recent-meta">
                    {updated ? <span>{updated}</span> : null}
                    {updated && editorName ? <span aria-hidden="true"> · </span> : null}
                    {editorName ? <span>{editorName}</span> : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
