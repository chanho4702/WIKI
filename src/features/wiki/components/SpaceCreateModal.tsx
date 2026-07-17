import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Modal, TextField, useToast } from "@chanho/react";
import type { Space } from "../store/types";
import { createSpace } from "../store/wikiStore";

export interface SpaceCreateModalProps {
  /** 트리거 버튼 문구 */
  triggerLabel?: string;
  onCreated: (space: Space) => void | Promise<void>;
  /**
   * 열림 상태를 외부에서 제어하고 싶을 때(W6: 스페이스 플라이아웃의 "스페이스 만들기" 버튼이
   * 이 모달을 열기 위함) 지정한다. 미지정 시 기존과 동일하게 내부 상태로 관리한다
   * (EmptySpaces.tsx 등 기존 사용처는 변경 없이 그대로 동작).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SpaceCreateModal({
  triggerLabel = "새 스페이스",
  onCreated,
  open: openProp,
  onOpenChange: onOpenChangeProp,
}: SpaceCreateModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const toast = useToast();

  const handleOpenChange = (next: boolean) => {
    if (onOpenChangeProp) {
      onOpenChangeProp(next);
    } else {
      setInternalOpen(next);
    }
    if (!next) {
      setName("");
      setKey("");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const space = await createSpace({ key, name });
      toast({ title: `스페이스 ${space.key}를 만들었습니다`, appearance: "success" });
      handleOpenChange(false);
      await onCreated(space);
    } catch (error) {
      toast({
        title: "스페이스 생성 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={<Button variant="subtle">{triggerLabel}</Button>}
      title="새 스페이스"
      description="이름과 키를 입력하세요. 키는 스페이스를 구분하는 접두어가 됩니다."
      open={open}
      onOpenChange={handleOpenChange}
    >
      <form className="space-create-form" onSubmit={handleSubmit}>
        <TextField
          label="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 개발 위키"
        />
        <TextField
          label="키"
          value={key}
          onChange={(e) => setKey(e.target.value.toUpperCase())}
          placeholder="예: DEV"
          description="대문자로 자동 변환됩니다"
        />
        <Button type="submit" disabled={!name.trim() || !key.trim()}>
          만들기
        </Button>
      </form>
    </Modal>
  );
}
