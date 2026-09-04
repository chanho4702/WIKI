import { useEffect, useState } from "react";
import { Button, useToast } from "@chanho/react";
import { Bell, BellOff } from "lucide-react";
import {
  getSpaceWatchState,
  getWatchState,
  setSpaceWatchState,
  setWatchState,
} from "../store/wikiStore";

interface WatchToggleProps {
  /** 대상 식별자 — 바뀌면 상태를 다시 읽는다. */
  targetId: string;
  labelOn: string;
  labelOff: string;
  toastOn: string;
  toastOff: string;
  read: (id: string) => Promise<boolean>;
  write: (id: string, watching: boolean) => Promise<boolean>;
}

/**
 * 구독 토글의 공통 몸통 — 페이지 구독(W21-4)과 스페이스 구독(W27-4)이 같은 모양이어야 한다.
 * 두 벌로 두면 로딩·실패·눌림 상태 처리가 조금씩 갈린다.
 */
function WatchToggle({
  targetId,
  labelOn,
  labelOff,
  toastOn,
  toastOff,
  read,
  write,
}: WatchToggleProps) {
  const toast = useToast();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void read(targetId)
      .then((state) => {
        if (!cancelled) setWatching(state);
      })
      .catch(() => {
        if (!cancelled) setWatching(false);
      });
    return () => {
      cancelled = true;
    };
    // read/write는 모듈 최상위 함수라 안정적이다 — 의존성에 넣으면 매 렌더 재조회가 된다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId]);

  if (watching === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const next = await write(targetId, !watching);
      setWatching(next);
      toast({ title: next ? toastOn : toastOff, appearance: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="small"
      variant="subtle"
      iconOnly
      disabled={busy}
      aria-pressed={watching}
      aria-label={watching ? labelOn : labelOff}
      title={watching ? labelOn : labelOff}
      onClick={() => void toggle()}
    >
      {watching ? (
        <Bell size={16} aria-hidden="true" />
      ) : (
        <BellOff size={16} aria-hidden="true" />
      )}
    </Button>
  );
}

/**
 * 페이지 구독 토글(W21-4).
 *
 * 만들거나 고치거나 댓글을 단 문서는 자동으로 구독된다 — 이 버튼은 그걸 **끄는** 수단이기도 하다.
 * 전에는 한 번 고친 문서의 알림을 영영 받을 수밖에 없었다.
 */
export function WatchButton({ pageId }: { pageId: string }) {
  return (
    <WatchToggle
      targetId={pageId}
      labelOn="구독 해제"
      labelOff="구독"
      toastOn="이 문서를 구독합니다"
      toastOff="구독을 해제했습니다"
      read={getWatchState}
      write={setWatchState}
    />
  );
}

/**
 * 스페이스 구독 토글(W27-4).
 *
 * 페이지 구독은 이미 있는 문서에만 걸 수 있어 "새 문서가 올라오면 알려줘"를 표현할 수 없었다.
 * 자동 구독은 없다 — 스페이스를 만든 것이 곧 그 안의 모든 문서에 대한 관심은 아니다.
 */
export function SpaceWatchButton({ spaceId }: { spaceId: string }) {
  return (
    <WatchToggle
      targetId={spaceId}
      labelOn="스페이스 구독 해제"
      labelOff="스페이스 구독"
      toastOn="이 스페이스를 구독합니다"
      toastOff="스페이스 구독을 해제했습니다"
      read={getSpaceWatchState}
      write={setSpaceWatchState}
    />
  );
}
