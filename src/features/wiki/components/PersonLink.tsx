import { useCallback, useEffect, useRef, useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { Link, useInRouterContext } from "react-router";
import { Avatar, Lozenge } from "@chanho/react";
import type { PersonProfile } from "../store/types";
import { getPersonProfile } from "../store/wikiStore";
import { useReadOnly } from "../lib/readOnly";
import { useDismissablePopover } from "../lib/useDismissablePopover";
import { isActiveMember, personPath } from "../lib/people";
import { PersonCardSkeleton } from "./WikiSkeleton";

/** 호버로 여는 카드의 지연 — 포인터가 스쳐 지나갈 때마다 카드가 튀어나오지 않게(컨플루언스 프로필 카드와 같은 결). */
const OPEN_DELAY_MS = 350;
/** 트리거 → 카드로 포인터를 옮기는 사이에 닫히지 않게 두는 유예. */
const CLOSE_DELAY_MS = 200;

export interface PersonLinkProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** 사람 id(org 멤버 id). 없으면 링크가 아니라 글자로 남는다. */
  userId: string | null | undefined;
  /** 카드를 불러오기 전에 보일 이름(멘션 스냅샷·디렉터리 이름). */
  name?: string | null;
  children: ReactNode;
}

/**
 * 사람 링크(F-07) — @멘션·작성자 이름·아바타를 사람 프로필(`/people/:id`)로 잇고, 호버·포커스에 프로필 카드를 연다.
 *
 * 링크가 되지 않는 경우: 라우터 밖(내보내기의 정적 렌더)·읽기 전용 인스턴스(공개 문서는 "누가"를 보이지 않는다)·
 * id 없음. 그때는 같은 속성의 span으로 그린다 — 칩 모양(`className`)은 그대로다.
 * 편집기 안의 멘션은 이 컴포넌트를 쓰지 않는다(TipTap 노드 렌더) — 편집 중 클릭이 화면을 떠나게 하지 않기 위해서다.
 */
export function PersonLink({ userId, name, children, className, ...rest }: PersonLinkProps) {
  const inRouter = useInRouterContext();
  const readOnly = useReadOnly();
  if (!inRouter || readOnly || !userId) {
    return (
      <span className={className} {...rest}>
        {children}
      </span>
    );
  }
  return (
    <PersonHoverLink userId={userId} name={name} className={className} {...rest}>
      {children}
    </PersonHoverLink>
  );
}

type CardState =
  | { kind: "loading" }
  | { kind: "ready"; profile: PersonProfile }
  | { kind: "missing" }
  | { kind: "error" };

function PersonHoverLink({ userId, name, children, className, ...rest }: PersonLinkProps & { userId: string }) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState<CardState | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const schedule = (next: boolean, delay: number) => {
    clearTimer();
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(next);
    }, delay);
  };
  useEffect(() => clearTimer, []);

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, []);
  useDismissablePopover({ containerRef, triggerRef, open, onClose: close });

  // 같은 자리의 링크가 다른 사람으로 바뀌면(문서 이동 등으로 인스턴스가 재사용될 때) 이전 사람의 카드를 버린다.
  // 진행 중이던 요청은 아래 효과의 정리 함수가 끊고, 다음에 열 때 새 사람으로 다시 묻는다.
  const [cardFor, setCardFor] = useState(userId);
  if (cardFor !== userId) {
    setCardFor(userId);
    setCard(null);
    setOpen(false);
  }

  // 카드는 처음 열릴 때 한 번만 묻는다. 실패하면 다음에 열 때 다시 묻는다(장애가 풀리면 바로 보이게).
  useEffect(() => {
    if (!open || (card !== null && card.kind !== "error")) return;
    let active = true;
    setCard({ kind: "loading" });
    void getPersonProfile(userId)
      .then((profile) => {
        if (active) setCard(profile ? { kind: "ready", profile } : { kind: "missing" });
      })
      .catch(() => {
        if (active) setCard({ kind: "error" });
      });
    return () => {
      active = false;
    };
    // card는 일부러 빼 둔다 — 넣으면 loading으로 바꾸는 순간 다시 돌아 요청이 끊긴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  const displayName =
    (card?.kind === "ready" ? card.profile.name : null) ?? (name?.trim() ? name : `사용자 #${userId}`);
  const path = personPath(userId);

  return (
    <span
      ref={containerRef}
      className="person-link"
      onMouseEnter={() => schedule(true, OPEN_DELAY_MS)}
      onMouseLeave={() => schedule(false, CLOSE_DELAY_MS)}
    >
      <Link
        ref={triggerRef}
        to={path}
        className={className}
        {...rest}
        onFocus={() => {
          clearTimer();
          setOpen(true);
        }}
      >
        {children}
      </Link>
      {open ? (
        // 카드는 문단(<p>) 안에서도 열리므로 블록 요소 대신 span으로 짓는다(div는 p 안에 둘 수 없다)
        <span className="person-card" role="dialog" aria-label={`${displayName} 프로필 카드`}>
          {card === null || card.kind === "loading" ? (
            <PersonCardSkeleton label="프로필 불러오는 중" />
          ) : card.kind === "error" ? (
            <span className="person-card-note">프로필을 불러오지 못했습니다</span>
          ) : card.kind === "missing" ? (
            <span className="person-card-note">사용자를 찾을 수 없습니다</span>
          ) : (
            <PersonCardBody profile={card.profile} />
          )}
          <Link to={path} className="person-card-profile" onClick={close}>
            프로필 보기
          </Link>
        </span>
      ) : null}
    </span>
  );
}

function PersonCardBody({ profile }: { profile: PersonProfile }) {
  const active = isActiveMember(profile.status);
  return (
    <>
      <span className="person-card-head">
        <Avatar name={profile.name} color="auto" size="large" aria-hidden="true" />
        <span className="person-card-ident">
          <span className="person-card-name">{profile.name}</span>
          {active ? null : <Lozenge appearance="neutral">비활성</Lozenge>}
        </span>
      </span>
      {active && profile.email ? (
        <a className="person-card-email" href={`mailto:${profile.email}`}>
          {profile.email}
        </a>
      ) : null}
      {active && profile.teams.length > 0 ? (
        <span className="person-card-teams">{profile.teams.map((t) => t.name).join(" · ")}</span>
      ) : null}
    </>
  );
}
