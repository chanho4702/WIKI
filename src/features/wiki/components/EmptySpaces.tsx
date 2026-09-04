import { EmptyState } from "@chanho/react";
import type { Space } from "../store/types";
import { SpaceCreateModal } from "./SpaceCreateModal";
import { useReadOnly } from "../lib/readOnly";

export interface EmptySpacesProps {
  onCreated: (space: Space) => void | Promise<void>;
}

export function EmptySpaces({ onCreated }: EmptySpacesProps) {
  const readOnly = useReadOnly();
  return (
    <div className="empty-spaces">
      <EmptyState
        title={readOnly ? "공개된 문서가 없습니다" : "아직 스페이스가 없습니다"}
        description={
          readOnly
            ? "아직 게시된 문서가 없습니다. 잠시 뒤에 다시 확인해 주세요."
            : "첫 스페이스를 만들어 위키를 시작하세요."
        }
      />
      {/* 읽기 전용 인스턴스는 웹에서 만들 방법이 없다 — 임포터만 문서를 넣는다(설계 §2.4) */}
      {readOnly ? null : (
        <SpaceCreateModal triggerLabel="첫 스페이스 만들기" onCreated={onCreated} />
      )}
    </div>
  );
}
