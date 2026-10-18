import { useEffect, useState } from "react";
import { Lozenge } from "@chanho/react";
import { getCurrentUser } from "../store/wikiStore";

export interface DraftBadgeProps {
  /** 초안 작성자 id */
  createdBy: string;
  className?: string;
}

/**
 * 초안 가시성 표시(위키 초안 정책, 2026-10-18 사용자 결정) — 초안은 작성자·스페이스 관리자·전역 관리자만 본다.
 * 작성자 본인에게는 "나만 보임", 관리자로서 남의 초안을 보는 사람에게는 "작성자·관리자만 보임"으로 알린다 —
 * 같은 문구를 쓰면 관리자가 남의 초안을 자기 것으로 오해한다. 현재 사용자를 아직 모르면 본인 문구가
 * 기본이다(초안을 여는 사람의 대부분이 작성자다).
 */
export function DraftBadge({ createdBy, className }: DraftBadgeProps) {
  const [meId, setMeId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getCurrentUser()
      .then((me) => {
        if (active) setMeId(me.id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const own = meId === null || meId === createdBy;
  return (
    <Lozenge appearance="info" className={className}>
      {own ? "초안 — 나만 보임" : "초안 — 작성자·관리자만 보임"}
    </Lozenge>
  );
}
