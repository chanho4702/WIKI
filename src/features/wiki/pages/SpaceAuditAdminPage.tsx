import { useEffect, useState } from "react";
import { Banner, EmptyState } from "@chanho/react";
import { ScrollText } from "lucide-react";
import type { AuditEntry, User } from "../store/types";
import { listSpaceDeletions, listUsers } from "../store/wikiStore";
import { SettingsHeader } from "../components/SettingsItem";
import { displayUserName } from "../lib/userName";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * 스페이스 삭제 기록(`/admin/audit`) — 전역 관리자 전용.
 *
 * 스페이스 감사 로그는 스페이스 안에서만 읽혀서, 스페이스를 지우면 "누가 지웠나"를 볼 곳이 없었다.
 * 기록은 스페이스보다 오래 남고(V30) 여기서 읽는다. 권한 판정은 서버가 한다 — 아니면 403 메시지를
 * 그대로 보여 준다(빈 목록으로 덮으면 "없는 건지 못 보는 건지" 구분이 안 된다).
 */
export function SpaceAuditAdminPage() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listSpaceDeletions()
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "기록을 불러오지 못했습니다"); });
    void listUsers().then((rows) => { if (!cancelled) setUsers(rows); });
    return () => { cancelled = true; };
  }, []);

  const actor = (id: string) => users.find((u) => u.id === id)?.name ?? displayUserName(id);

  return (
    <div className="space-settings">
      <SettingsHeader
        icon={<ScrollText size={20} aria-hidden="true" />}
        title="스페이스 삭제 기록"
        description="지워진 스페이스와 누가 언제 지웠는지. 스페이스가 사라져도 이 기록은 남습니다."
      />
      {error ? <Banner variant="danger">{error}</Banner> : null}
      {entries && entries.length === 0 ? (
        <EmptyState title="지워진 스페이스가 없습니다" description="스페이스를 삭제하면 여기에 기록이 남습니다." />
      ) : null}
      {entries && entries.length > 0 ? (
        <div className="space-settings-form">
          <table className="audit-table" aria-label="스페이스 삭제 기록">
            <thead>
              <tr>
                <th scope="col">시각</th>
                <th scope="col">스페이스</th>
                <th scope="col">삭제한 사람</th>
                <th scope="col">비고</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="audit-time">{formatTime(entry.createdAt)}</td>
                  <td><span className="audit-target">{entry.targetLabel}</span></td>
                  <td>{actor(entry.actorId)}</td>
                  <td>{entry.detail ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
