import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@chanho/react";
import type { AuditEntry, User } from "../store/types";
import { listAudit, listGrantAudit, listUsers } from "../store/wikiStore";
import { displayUserName } from "../lib/userName";

/**
 * 스페이스 감사 로그(W23) — 스페이스 설정의 한 섹션.
 *
 * "누가 이 문서를 지웠나", "언제부터 이 페이지가 잠겼나"를 확인할 방법이 없었다. 이력이 남는
 * 것은 본문 리비전뿐이고, 지우기·제한 변경처럼 되돌리기 어려운 조작은 흔적이 없었다.
 *
 * 대상 이름은 서버가 **그때의 스냅샷**으로 준다 — 지워진 문서를 id로 다시 조회할 수는 없다.
 *
 * 기록은 두 곳에서 온다: 위키 조작(wiki-backend)과 권한 부여·회수(org-service). 스페이스 권한은
 * org-service가 소유하고 프론트가 직접 부르므로 wiki는 그 조작을 보지 못한다 — 감사에서 가장
 * 궁금한 것이 "누가 이 사람에게 권한을 줬나"라, 두 목록을 시각순으로 합쳐 하나로 보여준다.
 */

const ACTION_LABEL: Record<string, string> = {
  PAGE_TRASHED: "문서를 휴지통으로",
  PAGE_RESTORED: "문서 복원",
  PAGE_PURGED: "문서 영구 삭제",
  PAGE_RESTRICTIONS_CHANGED: "문서 제한 변경",
  PAGE_OWNER_CHANGED: "문서 소유자 변경",
  PAGE_VERIFIED: "문서 검증",
  PAGE_UNVERIFIED: "문서 검증 해제",
  ATTACHMENT_DELETED: "첨부 삭제",
  GRANT_GRANTED: "권한 부여",
  GRANT_REVOKED: "권한 회수",
  SPACE_UPDATED: "스페이스 정보 변경",
  TEMPLATE_CREATED: "템플릿 추가",
  TEMPLATE_UPDATED: "템플릿 수정",
  TEMPLATE_DELETED: "템플릿 삭제",
};

/** 모르는 action은 그대로 보여준다 — 서버가 새 종류를 내보내도 화면이 빈칸이 되지 않는다. */
function actionLabel(action: string): string {
  return ACTION_LABEL[action] ?? action;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ""
    : at.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export function AuditSettings({ spaceId }: { spaceId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const reload = useCallback(async () => {
    try {
      /*
       * 두 원장을 함께 읽어 시각순으로 합친다.
       *
       * 권한 이력을 못 읽는다고 위키 기록까지 감추지는 않는다 — 권한 조회 범위가 더 좁을 수
       * 있고(전역 관리자 정책), 그때 화면이 통째로 비면 있는 기록도 못 보게 된다.
       */
      const [wiki, grants] = await Promise.all([
        listAudit(spaceId),
        listGrantAudit(spaceId).catch(() => [] as AuditEntry[]),
      ]);
      setEntries(
        [...wiki, ...grants].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
      );
      setError(null);
    } catch (reason) {
      setEntries([]);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [spaceId]);

  useEffect(() => {
    void reload();
    void listUsers().then(setUsers).catch(() => setUsers([]));
  }, [reload]);

  if (error) {
    // 권한 탭과 같은 방식 — 빈 목록으로 덮으면 "권한이 없는 건지 기록이 없는 건지" 구분되지 않는다.
    return <EmptyState title="감사 로그를 볼 수 없습니다" description={error} />;
  }

  if (entries === null) {
    return <span role="status">감사 로그 로딩 중</span>;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="기록이 없습니다"
        description="문서 삭제·복원, 제한 변경처럼 되돌리기 어려운 조작이 여기에 남습니다."
      />
    );
  }

  const actorName = (id: string) =>
    users.find((u) => u.id === id)?.name ?? displayUserName(id);

  return (
    <table className="audit-table" aria-label="감사 로그">
      <thead>
        <tr>
          <th scope="col">시각</th>
          <th scope="col">한 일</th>
          <th scope="col">대상</th>
          <th scope="col">사용자</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr key={entry.id}>
            <td className="audit-time">{formatTime(entry.createdAt)}</td>
            <td>{actionLabel(entry.action)}</td>
            <td>
              <span className="audit-target">{entry.targetLabel}</span>
              {entry.detail ? <span className="audit-detail">{entry.detail}</span> : null}
            </td>
            <td>{actorName(entry.actorId)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
