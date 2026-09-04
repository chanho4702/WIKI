import { useEffect, useState } from "react";
import { ConfirmDialog, Select, useToast } from "@chanho/react";
import type { Page, User } from "../store/types";
import { setPageOwner } from "../store/wikiStore";
import { displayUserName } from "../lib/userName";

/** "정하지 않음"을 고르는 값 — Select는 빈 문자열을 미선택으로 다루므로 자리표시자를 따로 둔다. */
const NONE = "__none__";

/**
 * 소유자 지정(W27-5).
 *
 * 소유자는 문서의 기본 책임자 표시일 뿐 권한과 무관하다 — 소유자로 지정해도 볼 수 있게 되지
 * 않는다(권한은 제한 W18이 담당). "정하지 않음"이 유효한 상태라 해제도 같은 자리에서 한다.
 */
export function PageOwnerDialog({
  open,
  onOpenChange,
  page,
  users,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: Page;
  users: User[];
  onSaved: (page: Page) => void;
}) {
  const toast = useToast();
  const [value, setValue] = useState(NONE);
  const [saving, setSaving] = useState(false);

  // 열 때마다 현재 소유자로 되돌린다 — 지난번에 고르다 만 값이 남아 있으면 엉뚱한 사람이 찍힌다
  useEffect(() => {
    if (open) setValue(page.ownerId ?? NONE);
  }, [open, page.ownerId]);

  const options = [
    { value: NONE, label: "정하지 않음" },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];
  // 디렉터리에서 사라진 사람이 소유자로 남아 있으면 목록에 없다 — 빈칸이 되지 않게 채워 넣는다
  if (page.ownerId && !users.some((u) => u.id === page.ownerId)) {
    options.push({ value: page.ownerId, label: displayUserName(page.ownerId) });
  }

  const save = async () => {
    setSaving(true);
    try {
      const next = await setPageOwner(page.id, value === NONE ? null : value);
      onSaved(next);
      onOpenChange(false);
      toast({
        title: next.ownerId ? "소유자를 지정했습니다" : "소유자를 해제했습니다",
        appearance: "success",
      });
    } catch (error) {
      toast({
        title: "소유자를 바꾸지 못했습니다",
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
      title="소유자 지정"
      description="문서의 기본 책임자를 표시합니다. 권한은 바뀌지 않습니다."
      confirmLabel="저장"
      loading={saving}
      onConfirm={() => void save()}
    >
      <Select label="소유자" options={options} value={value} onValueChange={setValue} />
    </ConfirmDialog>
  );
}
