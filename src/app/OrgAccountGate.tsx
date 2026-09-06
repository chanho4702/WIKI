import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { PendingApprovalGate } from "@chanho/org-admin";
import { Button, Spinner } from "@chanho/react";
import { Ban } from "lucide-react";
import type { OrgMe } from "../features/wiki/store/types";
import { AUTH_GATE_ENABLED } from "../features/wiki/store/apiClient";
import { useReadOnly } from "../features/wiki/lib/readOnly";
import { getOrgMe } from "../features/wiki/store/wikiStore";
import { useAuth } from "../auth/AuthGate";

export interface OrgAccountGateProps {
  /** 게이트를 켤지. 생략하면 로그인 게이트와 같은 조건(로그인이 없으면 계정 상태도 없다). */
  enabled?: boolean;
  children: ReactNode;
}

/** 로그아웃 — 승인 대기·정지·비활성 화면에서 유일하게 할 수 있는 일 */
function LogoutAction() {
  const { logout } = useAuth();
  return (
    <Button variant="secondary" onClick={() => void logout()}>
      로그아웃
    </Button>
  );
}

/** 정지·비활성 안내 — 공용 패키지에는 없어 여기서 그린다(ALM과 같은 문구·구조) */
function BlockedScreen({ title, body }: { title: string; body: string }) {
  return (
    <div className="org-gate" role="alert">
      <Ban size={40} aria-hidden />
      <h1 className="org-gate-title">{title}</h1>
      <p className="org-gate-body">{body}</p>
      <div className="org-gate-actions">
        <LogoutAction />
      </div>
    </div>
  );
}

/**
 * 계정 상태 게이트 — `AuthGate`(로그인) 뒤, 앱 셸보다 바깥이다.
 *
 * 로그인은 됐지만 조직에서 아직 승인받지 못했거나(PENDING) 정지·비활성된 계정은 org-service가
 * `/api/org/me` 외의 모든 호출을 403으로 막는다(설계 §3.2·§10). 셸을 그대로 그리면 화면마다
 * 오류가 뜨므로 여기서 한 번 막는다 — ALM의 `OrgAccountGate`와 같은 판정·문구를 쓴다.
 *
 * 켜는 조건은 `AUTH_GATE_ENABLED`와 같다 — 로그인 게이트가 꺼진 인스턴스(순수 dev 목업·vitest)에는
 * 승인해 줄 서버도, 격리할 계정도 없다. 공개 문서(읽기 전용) 인스턴스도 익명이라 제외한다.
 * 꺼져 있으면 `/api/org/me`를 아예 부르지 않는다(안쪽 컴포넌트를 마운트하지 않는다).
 */
export function OrgAccountGate({ enabled, children }: OrgAccountGateProps) {
  const readOnly = useReadOnly();
  const on = enabled ?? (AUTH_GATE_ENABLED && !readOnly);
  if (!on) return <>{children}</>;
  return <AccountStatusGate>{children}</AccountStatusGate>;
}

/**
 * `/api/org/me`는 **여기서 한 번만** 읽는다. 승인 대기 화면은 `@chanho/org-admin`의 것을 그대로
 * 쓰되(ALM·위키 같은 문구), 이미 읽은 프로필을 돌려주는 어댑터를 넘겨 같은 요청을 두 번 보내지
 * 않는다 — 전에는 게이트가 패키지에 `orgApiFetch`를 넘겨 왕복이 한 번 더 있었다.
 */
function AccountStatusGate({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<OrgMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMe(await getOrgMe());
    } catch (e) {
      // 삼키면 정지된 계정이 정상으로 보인다 — 상태를 모르면 앱을 열지 않는다(fail-closed).
      setMe(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 이미 읽은 프로필을 그대로 돌려주는 `OrgApiFetch` — 패키지 화면을 재사용하되 왕복은 없다
  const cachedMeApi = useCallback(
    async () =>
      new Response(JSON.stringify(me), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    [me],
  );

  if (error !== null) {
    return (
      <div className="org-gate" role="alert">
        <h1 className="org-gate-title">계정 상태를 확인하지 못했습니다</h1>
        <p className="org-gate-body">{error}</p>
        <div className="org-gate-actions">
          <Button variant="secondary" onClick={() => void load()}>
            다시 시도
          </Button>
          <LogoutAction />
        </div>
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="app-loading">
        <Spinner size="large" label="계정 상태 확인 중" />
      </div>
    );
  }

  if (me.status === "PENDING") {
    return (
      <PendingApprovalGate api={cachedMeApi} actions={<LogoutAction />}>
        {null}
      </PendingApprovalGate>
    );
  }

  if (me.status === "SUSPENDED") {
    return (
      <BlockedScreen
        title="정지된 계정입니다"
        body="관리자가 이 계정을 일시 정지했습니다. 다시 쓰려면 관리자에게 해제를 요청하세요."
      />
    );
  }

  if (me.status === "DEACTIVATED") {
    return (
      <BlockedScreen
        title="비활성된 계정입니다"
        body="이 계정은 비활성 처리됐습니다. 다시 들어오려면 관리자에게 재초대를 요청하세요."
      />
    );
  }

  return <>{children}</>;
}
