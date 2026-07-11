import type { Space } from "../store/types";
import { SpaceCreateModal } from "./SpaceCreateModal";

export interface EmptySpacesProps {
  onCreated: (space: Space) => void | Promise<void>;
}

export function EmptySpaces({ onCreated }: EmptySpacesProps) {
  return (
    <div className="empty-spaces">
      <h1>아직 스페이스가 없습니다</h1>
      <p>첫 스페이스를 만들어 위키를 시작하세요.</p>
      <SpaceCreateModal triggerLabel="첫 스페이스 만들기" onCreated={onCreated} />
    </div>
  );
}
