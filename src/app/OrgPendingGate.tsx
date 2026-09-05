import type { ReactNode } from "react";
import { PendingApprovalGate } from "@chanho/org-admin";
import { Button } from "@chanho/react";
import { AUTH_GATE_ENABLED } from "../features/wiki/store/apiClient";
import { useReadOnly } from "../features/wiki/lib/readOnly";
import { orgApiFetch } from "../features/wiki/store/wikiStore";
import { useAuth } from "../auth/AuthGate";

export interface OrgPendingGateProps {
  /** 게이트를 켤지. 생략하면 로그인 게이트와 같은 조건(로그인이 없으면 승인도 없다). */
  enabled?: boolean;
  children: ReactNode;
}

/**
 * 승인 대기 격리(U4, 설계 §6) — 초대 없이 로그인한 계정은 `/api/org/me.status === "PENDING"`이라
 * 셸의 모든 호출이 403을 받는다. 화면마다 오류를 띄우는 대신 셸보다 바깥에서 한 번 막는다.
 *
 * 켜는 조건은 `AUTH_GATE_ENABLED`와 같다 — 로그인 게이트가 꺼진 인스턴스(순수 dev 목업·vitest)에는
 * 승인해 줄 서버도, 격리할 계정도 없다. 공개 문서(읽기 전용) 인스턴스도 익명이라 제외한다.
 */
export function OrgPendingGate({ enabled, children }: OrgPendingGateProps) {
  const readOnly = useReadOnly();
  const { logout } = useAuth();
  const on = enabled ?? (AUTH_GATE_ENABLED && !readOnly);
  if (!on) return <>{children}</>;
  return (
    <PendingApprovalGate
      api={orgApiFetch}
      actions={
        <Button variant="secondary" onClick={() => void logout()}>
          로그아웃
        </Button>
      }
    >
      {children}
    </PendingApprovalGate>
  );
}
