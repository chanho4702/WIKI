import { useCallback, useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router";
import { Button, ConfirmDialog, EmptyState, Tabs, TextField, useToast } from "@chanho/react";
import { Trash2 } from "lucide-react";
import type { SpaceGrant, Team, User } from "../store/types";
import {
  addSpaceGrant,
  deleteSpace,
  listSpaceGrants,
  listTeams,
  listUsers,
  removeSpaceGrant,
  updateSpace,
} from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { displayUserName } from "../lib/userName";

const ROLE_LABEL: Record<SpaceGrant["role"], string> = {
  viewer: "보기",
  editor: "편집",
  admin: "관리",
};

/**
 * 스페이스 설정 (`/spaces/:spaceId/settings`) — 컨플루언스의 스페이스 설정에 해당한다.
 *
 * 이전에는 백엔드에 이름 변경·삭제 API가 있는데도 **화면 진입점이 아예 없었다**. 한번 만든
 * 스페이스는 이름도 못 고치고 지울 수도 없었다(갭 분석 §3.5).
 *
 * 권한 탭은 org-service의 grant를 직접 다룬다. 이 스페이스의 ADMIN이거나 전역 관리자만 볼 수
 * 있고, 아니면 서버가 403을 준다 — 화면은 그 사실을 그대로 보여준다. 빈 목록으로 덮으면
 * "권한이 없는 건지 아무도 없는 건지"를 구분할 수 없다.
 */
export function SpaceSettingsPage() {
  const { spaceId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { space, reloadPages } = useOutletContext<WikiOutletContext>();

  const [name, setName] = useState(space.name);
  const [description, setDescription] = useState(space.description ?? "");
  const [saving, setSaving] = useState(false);

  const [grants, setGrants] = useState<SpaceGrant[] | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [subjectType, setSubjectType] = useState<"user" | "team">("user");
  const [subjectId, setSubjectId] = useState("");
  const [role, setRole] = useState<SpaceGrant["role"]>("viewer");
  const [granting, setGranting] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(space.name);
    setDescription(space.description ?? "");
  }, [space]);

  const reloadGrants = useCallback(async () => {
    if (!spaceId) return;
    setGrantError(null);
    try {
      setGrants(await listSpaceGrants(spaceId));
    } catch (e) {
      setGrants([]);
      setGrantError(e instanceof Error ? e.message : String(e));
    }
  }, [spaceId]);

  useEffect(() => {
    void reloadGrants();
    void listUsers().then(setUsers);
    void listTeams().then(setTeams);
  }, [reloadGrants]);

  const handleSave = async () => {
    if (!spaceId || !name.trim()) return;
    setSaving(true);
    try {
      await updateSpace(spaceId, { name, description });
      await reloadPages();
      toast({ title: "스페이스 정보를 저장했습니다", appearance: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setSaving(false);
    }
  };

  const handleGrant = async () => {
    if (!spaceId || !subjectId) return;
    setGranting(true);
    try {
      await addSpaceGrant(spaceId, { subjectType, subjectId, role });
      setSubjectId("");
      await reloadGrants();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setGranting(false);
    }
  };

  const handleRevoke = async (grant: SpaceGrant) => {
    try {
      await removeSpaceGrant(grant.id);
      await reloadGrants();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    }
  };

  const handleDelete = async () => {
    if (!spaceId) return;
    setDeleting(true);
    try {
      await deleteSpace(spaceId);
      toast({ title: `"${space.name}" 스페이스를 삭제했습니다`, appearance: "success" });
      navigate("/spaces");
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
      setDeleting(false);
    }
  };

  const subjectLabel = (grant: SpaceGrant) =>
    grant.subjectType === "team"
      ? (teams.find((t) => t.id === grant.subjectId)?.name ?? `팀 #${grant.subjectId}`)
      : (users.find((u) => u.id === grant.subjectId)?.name ?? displayUserName(grant.subjectId));

  const candidates = subjectType === "team" ? teams : users;

  return (
    <div className="space-settings">
      <header>
        <h1 className="space-settings-title">스페이스 설정</h1>
        <p className="space-settings-desc">
          {space.name} ({space.key})
        </p>
      </header>

      <Tabs
        label="스페이스 설정"
        items={[
          {
            value: "general",
            label: "일반",
            content: (
              <div className="space-settings-form">
                <TextField
                  label="이름"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                />
                <TextField
                  label="설명 (선택)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <Button onClick={() => void handleSave()} disabled={!name.trim() || saving}>
                  저장
                </Button>
              </div>
            ),
          },
          {
            value: "permissions",
            label: "권한",
            content: (
              <div className="space-settings-form">
                {grantError ? (
                  <EmptyState
                    title="권한을 볼 수 없습니다"
                    description={grantError}
                    primaryAction={{ label: "다시 시도", onClick: () => void reloadGrants() }}
                  />
                ) : (
                  <>
                    <div className="space-settings-grant-add">
                      <select
                        aria-label="대상 종류"
                        value={subjectType}
                        onChange={(e) => {
                          setSubjectType(e.target.value as "user" | "team");
                          setSubjectId("");
                        }}
                      >
                        <option value="user">사용자</option>
                        <option value="team">팀</option>
                      </select>
                      <select
                        aria-label="대상"
                        value={subjectId}
                        onChange={(e) => setSubjectId(e.target.value)}
                      >
                        <option value="">선택하세요</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="역할"
                        value={role}
                        onChange={(e) => setRole(e.target.value as SpaceGrant["role"])}
                      >
                        {(["viewer", "editor", "admin"] as const).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="small"
                        onClick={() => void handleGrant()}
                        disabled={!subjectId || granting}
                      >
                        추가
                      </Button>
                    </div>
                    {grants === null ? (
                      <span role="status">권한 로딩 중</span>
                    ) : grants.length === 0 ? (
                      <EmptyState
                        title="지정된 권한이 없습니다"
                        description="사용자나 팀을 추가해 접근을 허용하세요."
                      />
                    ) : (
                      <table className="space-settings-grants">
                        <thead>
                          <tr>
                            <th scope="col">대상</th>
                            <th scope="col">종류</th>
                            <th scope="col">역할</th>
                            <th scope="col">작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grants.map((grant) => (
                            <tr key={grant.id}>
                              <td>{subjectLabel(grant)}</td>
                              <td>{grant.subjectType === "team" ? "팀" : "사용자"}</td>
                              <td>{ROLE_LABEL[grant.role]}</td>
                              <td>
                                <Button
                                  size="small"
                                  variant="subtle"
                                  aria-label={`${subjectLabel(grant)} 권한 회수`}
                                  onClick={() => void handleRevoke(grant)}
                                >
                                  회수
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            ),
          },
          {
            value: "danger",
            label: "삭제",
            content: (
              <div className="space-settings-form">
                <p className="space-settings-warning">
                  이 스페이스의 모든 문서와 이력, 첨부파일이 함께 사라집니다. 되돌릴 수 없습니다.
                </p>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={16} aria-hidden="true" />
                  스페이스 삭제
                </Button>
              </div>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="스페이스를 삭제할까요?"
        description={`"${space.name}"의 모든 문서와 이력이 사라집니다. 되돌릴 수 없습니다.`}
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        loading={deleting}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
