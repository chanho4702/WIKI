import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { Button, ConfirmDialog, EmptyState, TextField, useToast } from "@chanho/react";
import { LayoutTemplate, ScrollText, Settings, Trash2, UserPlus, Users } from "lucide-react";
import { SettingsHeader, SettingsItem } from "../components/SettingsItem";
import type { SpaceGrant, Team, User } from "../store/types";
import {
  addSpaceGrant,
  deleteSpace,
  listSpaceGrants,
  listTeams,
  listUsers,
  removeSpaceGrant,
  searchUsers,
  updateSpace,
} from "../store/wikiStore";
import type { WikiOutletContext } from "../components/wikiContext";
import { AuditSettings } from "../components/AuditSettings";
import { TemplateSettings } from "../components/TemplateSettings";
import { SpaceExportPanel } from "../components/SpaceExportPanel";
import { displayUserName } from "../lib/userName";

/** 설정 섹션 — 사이드바 항목과 URL 조각이 같은 목록에서 나온다. */
export const SETTINGS_SECTIONS = ["general", "permissions", "templates", "audit", "danger"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_LABEL: Record<SettingsSection, string> = {
  general: "일반",
  permissions: "권한",
  templates: "템플릿",
  audit: "감사 로그",
  danger: "스페이스 삭제",
};

/** 설정은 아이콘 · 제목 · 한 줄 설명 구조다 — 사이드바 항목과 화면 머리가 같은 표에서 나온다. */
export const SECTION_ICON = {
  general: Settings,
  permissions: Users,
  templates: LayoutTemplate,
  audit: ScrollText,
  danger: Trash2,
} as const;

/** 사이드바용 짧은 설명 — 한 줄에 들어가야 한다. 긴 설명은 화면 머리(SECTION_DESC)에 있다. */
export const SECTION_SHORT: Record<SettingsSection, string> = {
  general: "이름 · 설명 · 내보내기",
  permissions: "누가 보고 편집하는지",
  templates: "새 문서의 틀",
  audit: "권한 변경 기록",
  danger: "되돌릴 수 없음",
};

export const SECTION_DESC: Record<SettingsSection, string> = {
  general: "스페이스 이름과 설명을 바꾸고, 문서 전체를 내보냅니다.",
  permissions: "누가 보고, 댓글 달고, 편집하고, 관리할지 정합니다.",
  templates: "이 스페이스에서 새 문서를 만들 때 고를 수 있는 템플릿입니다.",
  audit: "권한이 언제 누구에 의해 어떻게 바뀌었는지의 기록입니다.",
  danger: "스페이스와 그 안의 모든 문서를 지웁니다. 되돌릴 수 없습니다.",
};

/** URL 조각은 사용자가 손댈 수 있다 — 모르는 값이면 조용히 첫 섹션으로 돌린다. */
function normalizedSection(raw: string | undefined): SettingsSection {
  return SETTINGS_SECTIONS.includes(raw as SettingsSection) ? (raw as SettingsSection) : "general";
}

const ROLE_LABEL: Record<SpaceGrant["role"], string> = {
  viewer: "보기",
  commenter: "댓글",
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
  const params = useParams();
  const spaceId = params.spaceId;
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
  /* 대상 검색(U4) — 사람이 늘어나면 전체 목록 select로는 고를 수 없다. 사용자는 서버가
   * 걸러 주고(`GET /api/org/members?q=`), 팀은 목록이 짧아 화면에서 거른다. */
  const [term, setTerm] = useState("");
  const [userMatches, setUserMatches] = useState<User[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
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
    // 목록은 권한 표의 이름 풀이에도 쓰인다 — 검색 결과와 별개로 유지한다
    void listUsers().then(setUsers);
    void listTeams().then(setTeams);
  }, [reloadGrants]);

  useEffect(() => {
    if (subjectType !== "user") return;
    let cancelled = false;
    setSearchError(null);
    void searchUsers(term).then(
      (found) => {
        if (!cancelled) setUserMatches(found);
      },
      (e: unknown) => {
        // 검색이 안 되는 것과 결과가 없는 것은 다르다 — 빈 목록으로 덮지 않는다
        if (!cancelled) setSearchError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [subjectType, term]);

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

  const candidates =
    subjectType === "team"
      ? teams.filter((t) => term.trim() === "" || t.name.toLowerCase().includes(term.trim().toLowerCase()))
      : (userMatches ?? users);

  /** 어떤 섹션을 그릴지는 URL이 정한다 — 설정 화면을 그대로 공유·북마크할 수 있어야 한다. */
  const section = normalizedSection(params.section);

  return (
    <div className="space-settings">
      {(() => {
        const Icon = SECTION_ICON[section];
        return (
          <SettingsHeader
            icon={<Icon size={20} aria-hidden="true" />}
            title={SECTION_LABEL[section]}
            description={`${SECTION_DESC[section]} — ${space.name} (${space.key})`}
          />
        );
      })()}

      {section === "general" ? (
        <>
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
              {/* 스페이스 내보내기(W23) — 문서 하나씩 받던 것을 스페이스 단위로. 관리자가 백업·이관에 쓴다 */}
              <SpaceExportPanel spaceId={space.id} spaceName={space.name} />
        </>
      ) : section === "permissions" ? (
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
                      <TextField
                        label="대상 검색"
                        placeholder="이름으로 좁히기"
                        value={term}
                        onChange={(e) => {
                          setTerm(e.target.value);
                          setSubjectId("");
                        }}
                      />
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
                        {(["viewer", "commenter", "editor", "admin"] as const).map((r) => (
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
                    {searchError ? (
                      <p className="space-settings-grant-error" role="status">
                        사용자를 검색할 수 없습니다: {searchError}
                      </p>
                    ) : null}
                    {/* 아직 계정이 없는 사람은 여기서 고를 수 없다 — 초대 화면으로 보낸다(U4 §6).
                      * 스페이스를 쿼리로 넘겨 어떤 리소스에서 왔는지는 남긴다. */}
                    <p className="space-settings-grant-invite">
                      찾는 사람이 없나요?{" "}
                      <Link to={`/admin/org/invitations?scope=SPACE&resourceId=${encodeURIComponent(space.id)}`}>
                        <UserPlus size={14} aria-hidden="true" /> 초대하기
                      </Link>
                    </p>
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
      ) : section === "templates" ? (
        <TemplateSettings spaceId={space.id} />
      ) : section === "audit" ? (
        <div className="space-settings-form">
          <AuditSettings spaceId={space.id} />
        </div>
      ) : (
        <div className="space-settings-form">
          <SettingsItem
            icon={<Trash2 size={18} aria-hidden="true" />}
            title="스페이스 삭제"
            description="이 스페이스의 모든 문서와 이력, 첨부파일이 함께 사라집니다. 되돌릴 수 없습니다."
            control={
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                스페이스 삭제
              </Button>
            }
          />
        </div>
      )}

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
