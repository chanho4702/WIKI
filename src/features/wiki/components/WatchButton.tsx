import { useEffect, useState } from "react";
import { Button, useToast } from "@chanho/react";
import { Bell, BellOff } from "lucide-react";
import { getWatchState, setWatchState } from "../store/wikiStore";

/**
 * 페이지 구독 토글(W21-4).
 *
 * 만들거나 고치거나 댓글을 단 문서는 자동으로 구독된다 — 이 버튼은 그걸 **끄는** 수단이기도 하다.
 * 전에는 한 번 고친 문서의 알림을 영영 받을 수밖에 없었다.
 */
export function WatchButton({ pageId }: { pageId: string }) {
  const toast = useToast();
  const [watching, setWatching] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getWatchState(pageId)
      .then((state) => {
        if (!cancelled) setWatching(state);
      })
      .catch(() => {
        if (!cancelled) setWatching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (watching === null) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const next = await setWatchState(pageId, !watching);
      setWatching(next);
      toast({
        title: next ? "이 문서를 구독합니다" : "구독을 해제했습니다",
        appearance: "success",
      });
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
      aria-label={watching ? "구독 해제" : "구독"}
      title={watching ? "구독 해제" : "구독"}
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
