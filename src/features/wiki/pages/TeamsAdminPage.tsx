import { useCallback, useEffect, useState } from "react";
import { Button, ConfirmDialog, EmptyState, PageHeader, TextField, useToast } from "@chanho/react";
import { Plus, Trash2, UserMinus, UserPlus } from "lucide-react";
import type { Team, TeamMember, User } from "../store/types";
import {
  addTeamMember,
  createTeam,
  deleteTeam,
  listTeamMembers,
  listTeams,
  listUsers,
  removeTeamMember,
} from "../store/wikiStore";
import { displayUserName } from "../lib/userName";

/**
 * 팀 관리(`/admin/teams`, W23) — 전역 관리자 전용.
 *
 * 스페이스 권한 부여에는 팀을 쓸 수 있었는데(W22) 정작 팀을 만들 화면이 없었다 — org-service
 * REST를 curl로 때려야 했다. 여기서 만들고 사람을 넣고 뺀다.
 *
 * 권한 판정은 서버가 한다(생성·수정·삭제·팀원 변경은 GLOBAL ADMIN). 화면은 403 메시지를 그대로
 * 보여준다 — 메뉴 항목 자체는 검색 색인 관리와 같은 게이트(전역 관리자)로 감춘다.
 */
export function TeamsAdminPage() {
  const toast = useToast();
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [newName, setNewName] = useState("");
  const [addUserId, setAddUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Team | null>(null);

  const reloadTeams = useCallback(async () => {
    const found = await listTeams();
    setTeams(found);
    setSelected((cur) => (cur ? (found.find((t) => t.id === cur.id) ?? null) : (found[0] ?? null)));
  }, []);

  useEffect(() => {
    void reloadTeams();
    void listUsers().then(setUsers).catch(() => setUsers([]));
  }, [reloadTeams]);

  useEffect(() => {
    if (!selected) {
      setMembers(null);
      return;
    }
    let cancelled = false;
    setMembers(null);
    void listTeamMembers(selected.id)
      .then((found) => {
        if (!cancelled) setMembers(found);
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const fail = (title: string, e: unknown) =>
    toast({ title, description: e instanceof Error ? e.message : String(e), appearance: "danger" });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const created = await createTeam(newName.trim());
      setNewName("");
      await reloadTeams();
      setSelected(created);
      toast({ title: `"${created.name}" 팀을 만들었습니다`, appearance: "success" });
    } catch (e) {
      fail("팀 만들기 실패", e);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteTeam(pendingDelete.id);
      setPendingDelete(null);
      setSelected(null);
      await reloadTeams();
    } catch (e) {
      fail("팀 삭제 실패", e);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    if (!selected || !addUserId) return;
    setBusy(true);
    try {
      await addTeamMember(selected.id, addUserId);
      setMembers(await listTeamMembers(selected.id));
      setAddUserId("");
    } catch (e) {
      fail("팀원 추가 실패", e);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!selected) return;
    setBusy(true);
    try {
      await removeTeamMember(selected.id, member.memberId);
      setMembers(await listTeamMembers(selected.id));
    } catch (e) {
      fail("팀원 제외 실패", e);
    } finally {
      setBusy(false);
    }
  };

  const candidates = users.filter((u) => !members?.some((m) => m.memberId === u.id));

  return (
    <section className="teams-admin" aria-labelledby="teams-admin-title">
      <div id="teams-admin-title">
        <PageHeader title="팀 관리" />
      </div>

      <div className="teams-admin-layout">
        <aside className="teams-admin-list">
          <form
            className="teams-admin-create"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <TextField
              label="새 팀 이름"
              value={newName}
              maxLength={100}
              onChange={(e) => setNewName(e.target.value)}
            />
            {/* 셸 헤더에 "만들기"(콘텐츠)가 이미 있다 — 같은 이름이면 스크린리더에서 구분되지 않는다 */}
            <Button type="submit" size="small" disabled={busy || !newName.trim()} iconBefore={<Plus size={14} aria-hidden="true" />}>
              팀 만들기
            </Button>
          </form>

          {teams === null ? (
            <span role="status">팀 로딩 중</span>
          ) : teams.length === 0 ? (
            <p className="teams-admin-empty">아직 팀이 없습니다.</p>
          ) : (
            <ul aria-label="팀 목록">
              {teams.map((team) => (
                <li key={team.id}>
                  <button
                    type="button"
                    className={selected?.id === team.id ? "teams-admin-item is-selected" : "teams-admin-item"}
                    aria-pressed={selected?.id === team.id}
                    onClick={() => setSelected(team)}
                  >
                    {team.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="teams-admin-detail">
          {!selected ? (
            <EmptyState title="팀을 고르세요" description="왼쪽에서 팀을 고르거나 새로 만드세요." />
          ) : (
            <>
              <header className="teams-admin-detail-head">
                <h2>{selected.name}</h2>
                <Button
                  size="small"
                  variant="danger"
                  disabled={busy}
                  iconBefore={<Trash2 size={14} aria-hidden="true" />}
                  onClick={() => setPendingDelete(selected)}
                >
                  팀 삭제
                </Button>
              </header>

              <div className="teams-admin-add">
                <label className="teams-admin-add-label">
                  <span>팀원 추가</span>
                  <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
                    <option value="">선택하세요</option>
                    {candidates.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="small"
                  disabled={busy || !addUserId}
                  iconBefore={<UserPlus size={14} aria-hidden="true" />}
                  onClick={() => void handleAdd()}
                >
                  추가
                </Button>
              </div>

              {members === null ? (
                <span role="status">팀원 로딩 중</span>
              ) : members.length === 0 ? (
                <EmptyState title="팀원이 없습니다" description="위에서 사람을 추가하세요." />
              ) : (
                <ul className="teams-admin-members" aria-label="팀원">
                  {members.map((m) => (
                    <li key={m.memberId}>
                      <span>{users.find((u) => u.id === m.memberId)?.name ?? m.displayName ?? displayUserName(m.memberId)}</span>
                      <Button
                        size="small"
                        variant="subtle"
                        disabled={busy}
                        aria-label={`${m.displayName ?? m.memberId} 제외`}
                        iconBefore={<UserMinus size={14} aria-hidden="true" />}
                        onClick={() => void handleRemove(m)}
                      >
                        제외
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="팀을 삭제할까요?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}"이(가) 사라집니다. 이 팀에 걸린 스페이스 권한도 더는 통하지 않습니다.`
            : undefined
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        loading={busy}
        onConfirm={() => void handleDelete()}
      />
    </section>
  );
}
