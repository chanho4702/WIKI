import { useEffect, useState } from "react";
import { ConfirmDialog, Radio, RadioGroup } from "@chanho/react";
import type { DeletePageOptions, PageType } from "../store/types";

interface DeleteContentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 지울 대상의 제목 — 무엇을 지우는지 문구에 그대로 넣는다. */
  title: string;
  type: PageType;
  /** 직계 자식 수. 0이면 선택지를 묻지 않는다. */
  childCount: number;
  loading?: boolean;
  onConfirm: (options?: DeletePageOptions) => void;
}

/**
 * 페이지·폴더 삭제 확인 (기획 P2 결정, 2026-07-28).
 *
 * 자식이 있으면 "막는다" 대신 **처리 방식을 고르게 한다** — 상위로 올리기 / 함께 삭제.
 * 기본값은 상위로 올리기다: 확인을 연타하는 사용자가 실수로 하위 문서를 통째로 잃지 않아야 한다.
 *
 * PageViewPage(페이지)와 FolderPage(폴더)가 같은 컴포넌트를 쓴다 — 같은 파괴적 액션의 문구와
 * 선택지가 화면마다 갈리면 사용자가 매번 다시 읽어야 한다.
 */
export function DeleteContentDialog({
  open,
  onOpenChange,
  title,
  type,
  childCount,
  loading,
  onConfirm,
}: DeleteContentDialogProps) {
  const [choice, setChoice] = useState<"promote" | "cascade">("promote");
  const noun = type === "folder" ? "폴더" : "페이지";
  const hasChildren = childCount > 0;

  // 다이얼로그를 닫았다 다시 열면 안전한 기본값으로 돌아간다 — 이전에 고른 "함께 삭제"가
  // 다음 삭제에 조용히 남아 있으면 안 된다.
  useEffect(() => {
    if (open) setChoice("promote");
  }, [open]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${noun} 삭제`}
      description={
        hasChildren
          ? `"${title}" ${noun}에 하위 항목이 ${childCount}개 있습니다. 어떻게 할지 선택하세요. 이 작업은 되돌릴 수 없습니다.`
          : `"${title}" ${noun}을(를) 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
      }
      confirmLabel="삭제"
      cancelLabel="취소"
      danger
      loading={loading}
      onConfirm={() => onConfirm(hasChildren ? { children: choice } : undefined)}
    >
      {hasChildren ? (
        <RadioGroup
          className="delete-choice"
          aria-label={`하위 항목 ${childCount}개 처리 방식`}
          value={choice}
          onValueChange={(next: string) => setChoice(next as "promote" | "cascade")}
        >
          <Radio
            value="promote"
            label={`하위 항목을 상위로 올리기 (${childCount}개 유지)`}
          />
          <Radio value="cascade" label={`하위 항목도 함께 삭제 (${childCount}개 삭제)`} />
        </RadioGroup>
      ) : null}
    </ConfirmDialog>
  );
}
