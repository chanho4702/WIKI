import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";
import { Button, EmptyState, useToast } from "@chanho/react";
import { ArchiveRestore, FileText, Folder } from "lucide-react";
import type { TrashItem, User } from "../store/types";
import { listArchive, listUsers, unarchivePage } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { displayUserName } from "../lib/userName";
import { contentPathIn } from "../lib/contentPath";

function formatAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * 스페이스 보관함(`/spaces/:spaceId/archive`, W23).
 *
 * 휴지통과 같은 표를 쓴다 — 행의 모양(TrashItem)이 같고, 사용자에게도 "트리에서 내려간 것"이라는
 * 점은 같다. 다른 점은 단 하나: 보관된 문서는 **열린다**. 그래서 이름이 링크다.
 */
export function ArchivePage() {
  const { spaceId } = useParams();
  const toast = useToast();
  const { space, reloadPages } = useOutletContext<WikiOutletContext>();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!spaceId) return;
    setError(null);
    try {
      setItems(await listArchive(spaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [spaceId]);

  useEffect(() => {
    void reload();
    void listUsers().then(setUsers);
  }, [reload]);

  const handleUnarchive = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      await unarchivePage(item.id);
      await Promise.all([reload(), reloadPages()]);
      toast({ title: `"${item.title}"의 보관을 해제했습니다`, appearance: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="trash-page">
      <header className="trash-page-head">
        <div>
          <h1 className="trash-page-title">보관함</h1>
          <p className="trash-page-desc">
            {space.name}에서 보관한 문서입니다. 트리와 검색에서 빠져 있지만 링크로는 열립니다.
          </p>
        </div>
      </header>

      {error !== null ? (
        <EmptyState
          title="보관함을 불러올 수 없습니다"
          description={error}
          primaryAction={{ label: "다시 시도", onClick: () => void reload() }}
        />
      ) : items === null ? (
        <span role="status">보관함 로딩 중</span>
      ) : items.length === 0 ? (
        <EmptyState
          title="보관한 문서가 없습니다"
          description="끝났지만 남겨 두고 싶은 문서를 페이지 메뉴에서 보관하면 여기에 모입니다."
        />
      ) : (
        <table className="trash-table">
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">보관한 사람</th>
              <th scope="col">보관한 날</th>
              <th scope="col">작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <Link className="trash-item-name" to={contentPathIn(spaceId ?? "", item)}>
                    {item.icon ? (
                      <span aria-hidden="true">{item.icon}</span>
                    ) : item.type === "folder" ? (
                      <Folder size={16} aria-hidden="true" />
                    ) : (
                      <FileText size={16} aria-hidden="true" />
                    )}
                    {item.title}
                  </Link>
                  {item.descendantCount > 0 ? (
                    <span className="trash-item-descendants">하위 {item.descendantCount}개 포함</span>
                  ) : null}
                </td>
                <td>{users.find((u) => u.id === item.deletedBy)?.name ?? displayUserName(item.deletedBy)}</td>
                <td>{formatAt(item.deletedAt)}</td>
                <td className="trash-item-actions">
                  <Button
                    variant="subtle"
                    size="small"
                    disabled={busyId === item.id}
                    iconBefore={<ArchiveRestore size={14} aria-hidden="true" />}
                    onClick={() => void handleUnarchive(item)}
                  >
                    보관 해제
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
