import { useEffect, useState } from "react";
import { Button, Modal, TextField, useToast } from "@chanho/react";
import type { Page, PageVersion } from "../store/types";
import { restoreVersion } from "../store/wikiStore";

export interface RestoreVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 현재 보고 있는 페이지 — no-op 판정(updatedAt 비교) 기준 */
  page: Page;
  /** 복원 대상 버전(메타만으로 충분 — 본문은 서버가 그 버전에서 읽는다) */
  version: PageVersion;
  /** 복원 결과 Page 전달 — 부모가 트리 갱신·이동을 수행 */
  onRestored: (page: Page) => void | Promise<void>;
}

/**
 * 복원 확인 다이얼로그 — 컨플루언스처럼 확인 한 번과 버전 코멘트를 받는다.
 *
 * 복원은 되돌릴 수 있는 조작이지만(새 버전으로 쌓인다) 문서 전체를 바꾸므로, 표의 버튼 한 번에
 * 바로 실행하지 않는다. 요약을 함께 받는 이유는 다음 사람이 이력에서 "왜 되돌렸는지"를 읽기
 * 위해서다 — 비워 두면 스토어의 기본 문구(`vN 버전으로 복원`)가 남는다.
 */
export function RestoreVersionDialog({
  open,
  onOpenChange,
  page,
  version,
  onRestored,
}: RestoreVersionDialogProps) {
  const [changeNote, setChangeNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // 열 때마다 기본값으로 되돌린다 — 이전에 고쳐 둔 문구가 다른 버전 복원에 따라붙지 않게.
  useEffect(() => {
    if (open) setChangeNote(`v. ${version.version}에서 복원`);
  }, [open, version.version]);

  const handleRestore = async () => {
    setBusy(true);
    try {
      const note = changeNote.trim();
      const restored = await restoreVersion(page.id, version.id, note === "" ? undefined : note);
      // no-op 판정(목업): 반환 Page의 updatedAt이 복원 전과 같으면 버전을 안 쌓았다.
      // 백엔드 모드는 updatedAt이 빈 문자열이라(설계 §9) 이 판정을 건너뛰어야 오작동 안 함 —
      // 백엔드 restore는 항상 새 버전을 만드므로 "복원했습니다"가 맞다.
      if (page.updatedAt !== "" && restored.updatedAt === page.updatedAt) {
        toast({ title: "현재 내용과 동일합니다 — 변경 없음", appearance: "info" });
      } else {
        toast({ title: `v${version.version} 버전으로 복원했습니다`, appearance: "success" });
      }
      // 이동 전에 닫는다 — 열린 채로 언마운트되면 Radix가 배경에 걸어둔 aria-hidden이
      // 해제되지 않아 이동한 화면이 접근성 트리에서 통째로 사라진다.
      onOpenChange(false);
      await onRestored(restored); // no-op이어도 무해 — 반환 Page가 현재와 동일
    } catch (error) {
      toast({
        title: "복원 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`v. ${version.version}으로 복원할까요?`}
      className="history-restore-modal"
    >
      <p className="history-restore-desc">
        v. {version.version} 내용으로 새 버전이 만들어집니다. 현재 내용은 히스토리에 그대로 남습니다.
      </p>
      <TextField
        label="변경 요약"
        value={changeNote}
        onChange={(e) => setChangeNote(e.target.value)}
      />
      <div className="history-restore-actions">
        <Button onClick={() => void handleRestore()} disabled={busy}>
          복원
        </Button>
        <Button variant="subtle" onClick={() => onOpenChange(false)} disabled={busy}>
          취소
        </Button>
      </div>
    </Modal>
  );
}
