import { useEffect, useState } from "react";
import { ConfirmDialog, TextField, useToast } from "@chanho/react";
import type { Page } from "../store/types";
import { verifyPage } from "../store/wikiStore";
import { defaultVerifiedUntil, VERIFICATION_DAYS } from "../lib/verification";

/**
 * 검증하기(W27-5).
 *
 * 검증은 사람이 "지금 읽어봤고 맞다"를 누르는 것이다. 마지막 수정일은 답이 되지 못한다 —
 * 오타 하나 고쳐도 날짜가 새로 찍히기 때문이다. 유효기간이 지나도 문서가 숨거나 잠기지 않고
 * 배지 문구만 "검증 만료"로 바뀐다.
 */
export function PageVerifyDialog({
  open,
  onOpenChange,
  page,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: Page;
  onSaved: (page: Page) => void;
}) {
  const toast = useToast();
  const [until, setUntil] = useState("");
  const [saving, setSaving] = useState(false);

  // 열 때마다 기본 유효기간으로 되돌린다 — 다시 검증하는 것은 기간을 새로 정하는 일이다
  useEffect(() => {
    if (open) setUntil(defaultVerifiedUntil());
  }, [open]);

  const save = async () => {
    setSaving(true);
    try {
      const next = await verifyPage(page.id, until || undefined);
      onSaved(next);
      onOpenChange(false);
      toast({ title: "이 문서를 검증했습니다", appearance: "success" });
    } catch (error) {
      toast({
        title: "검증하지 못했습니다",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="문서 검증"
      description="이 문서의 내용이 현재 기준으로 맞다는 표시입니다. 기간이 지나면 배지가 만료로 바뀝니다."
      confirmLabel="검증"
      loading={saving}
      onConfirm={() => void save()}
    >
      <TextField
        label="유효기간"
        type="date"
        value={until}
        description={`비워 두면 ${VERIFICATION_DAYS}일 뒤까지 유효합니다.`}
        onChange={(e) => setUntil(e.currentTarget.value)}
      />
    </ConfirmDialog>
  );
}
