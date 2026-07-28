import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { Button, Dropdown, EmptyState, InlineEdit, useToast } from "@chanho/react";
import { FileText, Folder, FolderPlus, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import type { Page, User } from "../store/types";
import { createPage, deletePage, listUsers, updatePage } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { DeleteContentDialog } from "../components/DeleteContentDialog";
import { contentPathIn } from "../lib/contentPath";
import { useCreateDraft } from "../lib/useCreateDraft";
import { displayUserName } from "../lib/userName";

/** "2026년 7월 10일" — PageViewPage/SpaceIndexPage와 같은 규칙(빈 값·무효 날짜는 빈 문자열). */
function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * 폴더 상세 (`/spaces/:spaceId/folder/:folderId`) — 캡처 `07-26-폴더2.png` 복제.
 * 배너 + 폴더 아이콘 + 이름(인라인 편집) + 작성자, 그 아래 자식 목록 표(이름·마지막 편집·작업).
 *
 * 폴더는 본문(body)을 쓰지 않는다(기획 P1) — 그래서 이 화면에는 편집 화면으로 가는 경로가 없고,
 * 표시할 것은 "무엇이 들어있는가"뿐이다.
 *
 * 배너 이미지는 파일 스토리지 선행이라 이번 범위 밖 — 단색 배경으로 대체한다(기획 §1 제외).
 */
export function FolderPage() {
  const { spaceId, folderId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { pages, space, reloadPages } = useOutletContext<WikiOutletContext>();
  const [users, setUsers] = useState<User[]>([]);
  const { createDraft } = useCreateDraft(spaceId ?? null, reloadPages);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void listUsers().then(setUsers);
  }, []);

  if (pages === null) {
    return (
      <div className="folder-page">
        <span className="wiki-visually-hidden" role="status">
          폴더 로딩 중
        </span>
        <div className="page-view-skeleton" aria-hidden="true">
          <span className="wiki-skeleton page-view-skeleton-title" />
          <div className="page-view-skeleton-body">
            {["60%", "72%", "45%"].map((width, i) => (
              <span key={i} className="wiki-skeleton wiki-skeleton-line" style={{ width }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const folder = pages.find((p) => p.id === folderId);
  if (!folder || folder.type !== "folder") {
    // 폴더 id로 일반 페이지를 열려 했거나 삭제된 경우 — 조용히 빈 화면을 두지 않는다
    return (
      <div className="folder-page">
        <EmptyState
          title="폴더를 찾을 수 없습니다"
          description="삭제되었거나 잘못된 주소일 수 있습니다."
          primaryAction={{ label: "스페이스로 이동", onClick: () => navigate(`/spaces/${spaceId}`) }}
        />
      </div>
    );
  }

  const children = pages
    .filter((p) => p.parentId === folder.id)
    .sort((a, b) => a.position - b.position);
  const owner = users.find((u) => u.id === folder.createdBy);
  const ownerName = owner?.name ?? (folder.createdBy ? displayUserName(folder.createdBy) : null);

  const rename = async (next: string) => {
    const title = next.trim();
    if (!title || title === folder.title) return; // 무변경·빈 이름은 무시(스토어도 거부한다)
    try {
      await updatePage(folder.id, { title });
      await reloadPages(); // 트리·이 화면이 같은 pages를 보므로 함께 갱신된다
    } catch (error) {
      toast({
        title: "이름 변경 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  const createChild = async (type: "page" | "folder") => {
    if (type === "page") {
      // 이 폴더의 하위 초안으로 만든다 — 트리·이 화면 양쪽에 바로 나타난다
      await createDraft(folder.id);
      return;
    }
    try {
      const created = await createPage({
        spaceId: space.id,
        parentId: folder.id,
        title: "제목 없는 폴더",
        type: "folder",
      });
      await reloadPages();
      navigate(contentPathIn(space.id, created));
    } catch (error) {
      toast({
        title: "폴더 만들기 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <div className="folder-page">
      <header className="folder-banner">
        <div className="folder-banner-art" aria-hidden="true" />
        <div className="folder-banner-body">
          <Folder className="folder-banner-icon" size={28} aria-hidden="true" />
          <div className="folder-banner-heading">
            {/* 캡처처럼 제목을 그 자리에서 고친다 — 폴더는 편집 화면이 없으므로 이게 유일한 이름 변경 경로다 */}
            <InlineEdit
              label="폴더 이름"
              value={folder.title}
              viewClassName="folder-banner-title"
              onSave={(next) => void rename(next)}
            />
            {ownerName ? <p className="folder-banner-meta">작성자 {ownerName}</p> : null}
          </div>
          {/* 삭제는 PageViewPage와 같은 패턴("…" 드롭다운 + 확인 다이얼로그)으로 둔다 —
            * 화면마다 파괴적 액션의 위치가 다르면 실수로 누르기 쉽다. */}
          <Dropdown
            trigger={
              <Button size="small" variant="subtle" iconOnly aria-label="더 보기" title="더 보기">
                <MoreHorizontal size={16} aria-hidden="true" />
              </Button>
            }
            items={[
              {
                label: "폴더 삭제",
                danger: true,
                icon: <Trash2 size={16} aria-hidden="true" />,
                // 자식이 있어도 막지 않는다 — 다이얼로그가 처리 방식을 묻는다(기획 P2).
                onSelect: () => setConfirmOpen(true),
              },
            ]}
          />
        </div>
      </header>

      <DeleteContentDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={folder.title}
        type="folder"
        childCount={children.length}
        loading={deleting}
        onConfirm={async (options) => {
          setDeleting(true);
          try {
            await deletePage(folder.id, options);
            toast({ title: `"${folder.title}" 폴더를 삭제했습니다`, appearance: "success" });
            // 이동 전에 닫는다 — 열린 채 언마운트되면 Radix의 배경 aria-hidden이 남는다
            // (PageViewPage와 동일 이유).
            setConfirmOpen(false);
            await reloadPages();
            navigate(`/spaces/${space.id}`);
          } catch (error) {
            toast({
              title: "삭제 실패",
              description: error instanceof Error ? error.message : String(error),
              appearance: "danger",
            });
            setConfirmOpen(false);
            setDeleting(false);
          }
        }}
      />

      <section className="folder-contents" aria-label="폴더 내용">
        <div className="folder-contents-actions">
          <Button
            size="small"
            iconBefore={<Plus size={16} aria-hidden="true" />}
            onClick={() => void createChild("page")}
          >
            페이지 만들기
          </Button>
          <Button
            size="small"
            variant="subtle"
            iconBefore={<FolderPlus size={16} aria-hidden="true" />}
            onClick={() => void createChild("folder")}
          >
            하위 폴더
          </Button>
        </div>

        {children.length === 0 ? (
          <EmptyState
            title="이 폴더는 비어 있습니다"
            description="페이지나 하위 폴더를 만들어 정리를 시작하세요."
          />
        ) : (
          // DS Table 대신 직접 표를 쓴다 — 캡처의 열 구성(이름·마지막 편집·작업)에 맞춰
          // 이름 셀이 아이콘+링크 조합이고, 행마다 링크 대상이 타입에 따라 갈리기 때문이다.
          <table className="folder-table">
            <caption className="wiki-visually-hidden">{folder.title} 폴더의 항목 목록</caption>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">마지막 편집</th>
                <th scope="col">작업</th>
              </tr>
            </thead>
            <tbody>
              {children.map((child) => (
                <FolderRow key={child.id} item={child} spaceId={space.id} users={users} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function FolderRow({ item, spaceId, users }: { item: Page; spaceId: string; users: User[] }) {
  const editor = users.find((u) => u.id === item.updatedBy);
  const editorName = editor?.name ?? (item.updatedBy ? displayUserName(item.updatedBy) : null);
  const updated = formatDate(item.updatedAt);
  const isFolder = item.type === "folder";
  return (
    <tr>
      <td>
        <Link to={contentPathIn(spaceId, item)} className="folder-table-name">
          {isFolder ? (
            <Folder size={16} aria-hidden="true" />
          ) : (
            <FileText size={16} aria-hidden="true" />
          )}
          <span>{item.title}</span>
          {isFolder ? <span className="wiki-visually-hidden"> (폴더)</span> : null}
        </Link>
      </td>
      <td className="folder-table-meta">
        {updated || editorName ? (
          <>
            {updated}
            {updated && editorName ? " · " : ""}
            {editorName}
          </>
        ) : (
          <span className="folder-table-muted">—</span>
        )}
      </td>
      <td>
        {/* 폴더는 편집 화면이 없다 — 페이지에만 편집 링크를 준다 */}
        {isFolder ? (
          <span className="folder-table-muted">—</span>
        ) : (
          <Link to={`/spaces/${spaceId}/pages/${item.id}/edit`} className="folder-table-action">
            편집
          </Link>
        )}
      </td>
    </tr>
  );
}
