import { useEffect, useMemo, useState } from "react";
import { Button, ConfirmDialog, TextArea, TextField, useToast } from "@chanho/react";
import { Link2 } from "lucide-react";
import type { Page, User } from "../store/types";
import { getCurrentUser, sharePage } from "../store/wikiStore";
import { contentPathIn } from "../lib/contentPath";

/**
 * 페이지 공유(W23) — 컨플루언스의 "공유"에 해당한다.
 *
 * "이 문서 봐주세요"를 전할 방법이 없었다. 링크를 메신저에 붙이거나 본문에 멘션을 억지로 넣어야
 * 했다 — 후자는 문서를 더럽힌다. 공유는 수신자의 알림함에 메모와 함께 뜬다.
 *
 * 링크 복사도 여기 둔다. 공유의 절반은 "URL을 어디에 붙이는 것"이고, 그 버튼이 트리의 "…"에만
 * 있어서 문서를 보는 화면에서는 주소창을 긁어야 했다.
 */
export function ShareDialog({
  open,
  onOpenChange,
  page,
  users,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: Page;
  users: User[];
}) {
  const toast = useToast();
  const [me, setMe] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void getCurrentUser().then((u) => setMe(u?.id ?? null)).catch(() => setMe(null));
  }, []);

  // 열 때마다 비운다 — 지난번 수신자가 남아 있으면 엉뚱한 사람에게 간다.
  useEffect(() => {
    if (open) {
      setFilter("");
      setChosen(new Set());
      setNote("");
    }
  }, [open]);

  const candidates = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return users
      .filter((u) => u.id !== me) // 자신에게 보내는 공유는 의미가 없다
      .filter((u) => !q || u.name.toLowerCase().includes(q));
  }, [users, filter, me]);

  const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}${contentPathIn(page.spaceId, page)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "링크를 복사했습니다", appearance: "success" });
    } catch {
      toast({ title: "링크 복사에 실패했습니다", description: url, appearance: "danger" });
    }
  };

  const send = async () => {
    if (chosen.size === 0) return;
    setSending(true);
    try {
      const delivered = await sharePage(page.id, [...chosen], note);
      onOpenChange(false);
      // 볼 수 없는 수신자는 조용히 빠진다 — 그 사실을 수로 알린다(권한은 공유로 생기지 않는다).
      toast({
        title:
          delivered === chosen.size
            ? `${delivered}명에게 공유했습니다`
            : `${delivered}명에게 공유했습니다 (${chosen.size - delivered}명은 이 문서를 볼 수 없어 제외)`,
        appearance: "success",
      });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setSending(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="페이지 공유"
      description={`"${page.title}"을(를) 알림으로 보냅니다.`}
      confirmLabel="공유"
      cancelLabel="닫기"
      loading={sending}
      onConfirm={() => void send()}
    >
      <div className="share-dialog">
        <div className="share-link-row">
          <code className="share-link">{url}</code>
          <Button
            size="small"
            variant="subtle"
            iconBefore={<Link2 size={14} aria-hidden="true" />}
            onClick={() => void copyLink()}
          >
            링크 복사
          </Button>
        </div>

        <TextField
          label="받는 사람 검색"
          value={filter}
          placeholder="이름"
          onChange={(e) => setFilter(e.target.value)}
        />
        {candidates.length === 0 ? (
          <p className="share-empty">보낼 수 있는 사람이 없습니다.</p>
        ) : (
          <ul className="share-user-list" aria-label="받는 사람">
            {candidates.map((u) => {
              const on = chosen.has(u.id);
              return (
                <li key={u.id}>
                  <label className="share-user">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setChosen((prev) => {
                          const next = new Set(prev);
                          if (on) next.delete(u.id);
                          else next.add(u.id);
                          return next;
                        })
                      }
                    />
                    <span>{u.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <TextArea
          label="메모 (선택)"
          rows={2}
          value={note}
          maxLength={300}
          placeholder="왜 봐야 하는지 한 줄"
          onChange={(e) => setNote(e.target.value)}
        />
        {chosen.size === 0 ? (
          <p className="share-hint">받는 사람을 한 명 이상 고르세요.</p>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
