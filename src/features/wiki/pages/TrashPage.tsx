import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { Button, EmptyState, useToast } from "@chanho/react";
import { FileText, Folder, RotateCcw, Trash2 } from "lucide-react";
import type { TrashItem, User } from "../store/types";
import { emptyTrash, listTrash, listUsers, purgePage, restorePage } from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { displayUserName } from "../lib/userName";
import { contentPathIn } from "../lib/contentPath";

/** "2026년 8월 28일 21:04" — 휴지통은 "언제 버렸는지"가 판단 근거라 시각까지 보여준다. */
function formatDeletedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 스페이스 휴지통 (`/spaces/:spaceId/trash`) — 컨플루언스 스페이스 설정의 휴지통에 해당한다.
 *
 * 하위와 함께 버린 묶음은 한 줄로 보이고 "하위 N개 포함"으로 규모를 알린다 — 하위 30개를
 * 지운 사람에게 31줄을 보여주지 않는다(백엔드 TrashService.list와 같은 규칙).
 *
 * 영구 삭제는 되돌릴 수 없어 서버가 스페이스 ADMIN만 허용한다. 프론트는 권한을 미리 알 수
 * 없으므로 버튼을 감추지 않고, 403 메시지를 그대로 보여준다.
 */
export function TrashPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
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
      setItems(await listTrash(spaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [spaceId]);

  useEffect(() => {
    void reload();
    void listUsers().then(setUsers);
  }, [reload]);

  const handleRestore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      const result = await restorePage(item.id);
      await Promise.all([reload(), reloadPages()]);
      toast({
        title: result.reparentedToRoot
          ? `원래 위치가 없어 "${item.title}"을(를) 최상위로 복원했습니다`
          : `"${item.title}"을(를) 복원했습니다`,
        description:
          result.restoredCount > 1 ? `하위 ${result.restoredCount - 1}개를 함께 복원했습니다.` : undefined,
        appearance: "success",
      });
      navigate(contentPathIn(spaceId ?? "", result.page));
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusyId(null);
    }
  };

  const handlePurge = async (item: TrashItem) => {
    // 되돌릴 수 없는 동작이라 확인을 한 번 받는다 — 목록의 X 연타로 문서가 사라지면 안 된다.
    if (!window.confirm(`"${item.title}"을(를) 영구 삭제합니다. 되돌릴 수 없습니다.`)) return;
    setBusyId(item.id);
    try {
      await purgePage(item.id);
      await reload();
      toast({ title: `"${item.title}"을(를) 영구 삭제했습니다`, appearance: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusyId(null);
    }
  };

  const handleEmpty = async () => {
    if (!spaceId || items === null || items.length === 0) return;
    if (!window.confirm(`휴지통의 ${items.length}개 항목을 영구 삭제합니다. 되돌릴 수 없습니다.`)) return;
    try {
      const purged = await emptyTrash(spaceId);
      await reload();
      toast({ title: `${purged}개 항목을 영구 삭제했습니다`, appearance: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    }
  };

  return (
    <div className="trash-page">
      <header className="trash-page-head">
        <div>
          <h1 className="trash-page-title">휴지통</h1>
          <p className="trash-page-desc">
            {space.name}에서 삭제한 문서입니다. 복원하면 원래 자리로 돌아갑니다.
          </p>
        </div>
        {items !== null && items.length > 0 ? (
          <Button variant="secondary" onClick={() => void handleEmpty()}>
            휴지통 비우기
          </Button>
        ) : null}
      </header>

      {error !== null ? (
        <EmptyState
          title="휴지통을 불러올 수 없습니다"
          description={error}
          primaryAction={{ label: "다시 시도", onClick: () => void reload() }}
        />
      ) : items === null ? (
        <span role="status">휴지통 로딩 중</span>
      ) : items.length === 0 ? (
        <EmptyState title="휴지통이 비어 있습니다" description="삭제한 문서가 여기에 보관됩니다." />
      ) : (
        <table className="trash-table">
          <thead>
            <tr>
              <th scope="col">이름</th>
              <th scope="col">삭제한 사람</th>
              <th scope="col">삭제한 시각</th>
              <th scope="col">작업</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <span className="trash-item-name">
                    {item.icon ? (
                      <span aria-hidden="true">{item.icon}</span>
                    ) : item.type === "folder" ? (
                      <Folder size={16} aria-hidden="true" />
                    ) : (
                      <FileText size={16} aria-hidden="true" />
                    )}
                    {item.title}
                  </span>
                  {item.descendantCount > 0 ? (
                    <span className="trash-item-descendants">
                      하위 {item.descendantCount}개 포함
                    </span>
                  ) : null}
                </td>
                <td>{users.find((u) => u.id === item.deletedBy)?.name ?? displayUserName(item.deletedBy)}</td>
                <td>{formatDeletedAt(item.deletedAt)}</td>
                <td className="trash-item-actions">
                  <Button
                    variant="subtle"
                    size="small"
                    disabled={busyId === item.id}
                    iconBefore={<RotateCcw size={14} aria-hidden="true" />}
                    onClick={() => void handleRestore(item)}
                  >
                    복원
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    disabled={busyId === item.id}
                    iconBefore={<Trash2 size={14} aria-hidden="true" />}
                    onClick={() => void handlePurge(item)}
                  >
                    영구 삭제
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
