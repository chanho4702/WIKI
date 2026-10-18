import { useEffect, useState } from "react";
import { Banner, ConfirmDialog, Lozenge, useToast } from "@chanho/react";
import { X } from "lucide-react";
import type {
  PageRestrictions,
  RestrictionPrincipal,
  Team,
  User,
} from "../store/types";
import { getPageRestrictions, listSelectableUsers, listTeams, setPageRestrictions } from "../store/wikiStore";

export interface RestrictionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  users: User[];
  /** 저장 성공 후 최신 제한 상태 통지 — 자물쇠 아이콘 상태 갱신용. */
  onSaved?: (restrictions: PageRestrictions) => void;
}

/**
 * 페이지 제한 자물쇠 다이얼로그(W18 설계 §7, 컨플루언스 참조).
 * 보기 제한(비우면 모두 볼 수 있음 — 상속만 적용)과 편집 제한을 주체(사용자·팀) 목록으로
 * 관리하고 전체 교체로 저장한다. 조상에서 상속되는 보기 제한은 읽기 전용으로 표시한다.
 */
export function RestrictionsDialog({ open, onOpenChange, pageId, users, onSaved }: RestrictionsDialogProps) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<PageRestrictions | null>(null);
  const [view, setView] = useState<RestrictionPrincipal[]>([]);
  const [edit, setEdit] = useState<RestrictionPrincipal[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  // 고를 수 있는 사람 — 디렉터리를 이 다이얼로그가 직접 다시 묻는다(스토어 캐시라 요청은 늘지 않는다).
  // 부모가 넘긴 users는 이름 표시용이라 장애 때 빈 목록이 되므로 선택 근거로 쓰지 않는다.
  const [selectableUsers, setSelectableUsers] = useState<User[] | null>(null);
  /** 조직 디렉터리 장애(W-18) — 빈 선택지로 삼키지 않고 원인을 보이며 저장을 막는다. */
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(null);
    setDirectoryError(null);
    setSelectableUsers(null);
    void Promise.all([
      getPageRestrictions(pageId),
      Promise.allSettled([listTeams(), listSelectableUsers()]),
    ])
      .then(([r, [t, u]]) => {
        setLoaded(r);
        setView(r.view);
        setEdit(r.edit);
        setTeams(t.status === "fulfilled" ? t.value : []);
        setSelectableUsers(u.status === "fulfilled" ? u.value : null);
        const failure = [t, u].find((x): x is PromiseRejectedResult => x.status === "rejected");
        if (failure) {
          setDirectoryError(failure.reason instanceof Error ? failure.reason.message : String(failure.reason));
        }
      })
      .catch((e: unknown) => {
        toast({
          title: "제한 정보를 불러오지 못했습니다",
          description: e instanceof Error ? e.message : undefined,
          appearance: "danger",
        });
        onOpenChange(false);
      });
    // toast/onOpenChange는 안정 참조 전제(호출부 고정) — pageId·open에만 반응한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pageId]);

  const pickableUsers = selectableUsers ?? [];
  const nameUsers = selectableUsers ?? users;

  const nameOf = (p: RestrictionPrincipal) =>
    p.type === "team"
      ? (teams.find((t) => t.id === p.id)?.name ?? `팀 #${p.id}`)
      : (nameUsers.find((u) => u.id === p.id)?.name ?? `사용자 #${p.id}`);

  const handleSave = async () => {
    if (directoryError !== null) {
      // 누가 누구인지 확인할 수 없는 상태에서 제한을 전량 교체하면 잘못된 주체로 저장될 수 있다
      toast({
        title: "조직 디렉터리에 연결된 뒤 저장할 수 있습니다",
        description: directoryError,
        appearance: "danger",
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await setPageRestrictions(pageId, { view, edit });
      onSaved?.(saved);
      onOpenChange(false);
      toast({ title: "페이지 제한을 저장했습니다", appearance: "success" });
    } catch (e) {
      toast({
        title: "제한 저장 실패",
        description: e instanceof Error ? e.message : undefined,
        appearance: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const section = (
    label: string,
    hint: string,
    list: RestrictionPrincipal[],
    setList: (next: RestrictionPrincipal[]) => void,
  ) => (
    <section className="restriction-section" aria-label={label}>
      <h4>{label}</h4>
      <p className="restriction-hint">{hint}</p>
      {list.length > 0 && (
        <ul className="restriction-list">
          {list.map((p) => (
            <li key={`${p.type}-${p.id}`}>
              {p.type === "team" ? <Lozenge appearance="info">팀</Lozenge> : null}
              <span>{nameOf(p)}</span>
              <button
                type="button"
                aria-label={`${nameOf(p)} 제거`}
                onClick={() => setList(list.filter((x) => !(x.type === p.type && x.id === p.id)))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <select
        className="page-tree-move-select"
        aria-label={`${label} 주체 추가`}
        value=""
        onChange={(e) => {
          const [type, id] = e.target.value.split(":");
          if (!id) return;
          const principal: RestrictionPrincipal = { type: type as RestrictionPrincipal["type"], id };
          if (!list.some((x) => x.type === principal.type && x.id === principal.id)) {
            setList([...list, principal]);
          }
        }}
      >
        <option value="">사용자·팀 추가…</option>
        <optgroup label="사용자">
          {pickableUsers.map((u) => (
            <option key={u.id} value={`user:${u.id}`}>
              {u.name}
            </option>
          ))}
        </optgroup>
        {teams.length > 0 && (
          <optgroup label="팀">
            {teams.map((t) => (
              <option key={t.id} value={`team:${t.id}`}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </section>
  );

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="페이지 제한"
      confirmLabel="저장"
      cancelLabel="취소"
      loading={saving}
      onConfirm={() => void handleSave()}
    >
      {loaded === null ? (
        <p role="status">제한 정보를 불러오는 중…</p>
      ) : (
        <div className="restriction-dialog">
          {directoryError !== null ? (
            <Banner variant="danger">
              조직 디렉터리에 연결할 수 없습니다 — 사용자·팀을 고를 수 없어 저장을 막았습니다. ({directoryError})
            </Banner>
          ) : null}
          {section(
            "보기 제한",
            "비워 두면 스페이스 권한이 있는 모두가 볼 수 있습니다. 지정하면 목록의 주체만 봅니다(하위 페이지에 상속).",
            view,
            setView,
          )}
          {section(
            "편집 제한",
            "비워 두면 편집 권한이 있는 모두가 수정할 수 있습니다. 이 페이지에만 적용됩니다.",
            edit,
            setEdit,
          )}
          {loaded.inherited.length > 0 && (
            <section className="restriction-section" aria-label="상속된 보기 제한">
              <h4>상속된 보기 제한</h4>
              <ul className="restriction-inherited">
                {loaded.inherited.map((i) => (
                  <li key={i.pageId}>
                    상위 “{i.pageTitle}”에서 상속 — {i.principals.map(nameOf).join(", ")}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </ConfirmDialog>
  );
}
