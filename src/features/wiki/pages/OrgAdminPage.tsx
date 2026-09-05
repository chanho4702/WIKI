import { useCallback, useEffect, useState } from "react";
import { OrgAdminApp } from "@chanho/org-admin";
import { EmptyState, Spinner } from "@chanho/react";
import type { OrgMe } from "../store/types";
import { getOrgMe, listSpaces, orgApiFetch } from "../store/wikiStore";

/**
 * 사용자·팀 관리(`/admin/org/*`, U4) — 화면 자체는 공용 패키지 `@chanho/org-admin`이 그린다.
 *
 * wiki와 ALM이 같은 관리 화면을 각자 복제하면 초대·승인·권한 규칙이 조용히 갈린다(설계 §5).
 * 위키가 하는 일은 셋뿐이다: 인증 fetch를 주고, 내가 누구인지 알려 주고, 스페이스 id를
 * 사람이 읽는 이름·링크로 풀어 준다. 패키지는 위키를 모른다.
 */

/** 패키지는 리소스 링크를 `<a href>`로 그린다 — 라우터를 거치지 않으므로 basename을 직접 붙인다. */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

const spaceHref = (id: string) => `${BASE}/spaces/${id}`;

/*
 * 아래 둘은 모듈 스코프에 둔다 — 패키지 컨텍스트가 이 값들을 useMemo 의존성으로 쓴다.
 * 렌더마다 새 함수를 넘기면 API 클라이언트가 매번 새로 만들어져 화면이 계속 다시 읽는다.
 */
const LINKS = { space: spaceHref };

const resolveResource = async (scope: string, id: string): Promise<{ name: string; href?: string }> => {
  if (scope !== "SPACE") return { name: id };
  const space = (await listSpaces()).find((s) => s.id === id);
  return space ? { name: space.name, href: spaceHref(space.id) } : { name: id };
};

export function OrgAdminPage() {
  const [me, setMe] = useState<OrgMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMe(await getOrgMe());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 내가 누구인지 모르면 패키지를 띄울 수 없다(관리자 UI가 globalRoles로 열린다) —
  // 빈 화면으로 덮지 않고 이유와 재시도를 노출한다.
  if (error !== null) {
    return (
      <EmptyState
        title="관리 화면을 열 수 없습니다"
        description={error}
        primaryAction={{ label: "다시 시도", onClick: () => void load() }}
      />
    );
  }

  if (me === null) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="불러오는 중" />
      </div>
    );
  }

  return (
    <OrgAdminApp
      basePath="/admin/org"
      api={orgApiFetch}
      currentUser={{ id: me.id, globalRoles: me.globalRoles }}
      resolveResource={resolveResource}
      links={LINKS}
    />
  );
}
