import type { ReactElement, ReactNode } from "react";
import { Dropdown } from "@chanho/react";
import { FileText, Folder } from "lucide-react";
import type { PageType } from "../store/types";

export interface CreateContentMenuProps {
  /** 드롭다운을 여는 요소 — 진입점마다 다르다(헤더는 라벨 버튼, 트리·사이드바는 아이콘 버튼).
   *  Dropdown이 ref/aria를 주입하려면 단일 엘리먼트여야 한다(ReactNode 불가). */
  trigger: ReactElement;
  onSelect: (type: PageType) => void;
  /** 진입점 고유 항목(예: 헤더의 "새 스페이스") — 페이지·폴더 아래에 붙는다. */
  extraItems?: Array<{ label: string; icon?: ReactNode; onSelect: () => void }>;
}

/**
 * "무엇을 만들지" 고르는 공용 메뉴.
 *
 * 전에는 헤더와 폴더 화면에만 선택지가 있고 스페이스 개요·사이드바·트리 행의 +는 페이지만
 * 만들었다 — 같은 `+`인데 어디서 눌렀느냐에 따라 폴더를 만들 수 있기도 없기도 했다.
 * 진입점마다 메뉴를 따로 짜면 또 갈라지므로 항목 구성을 여기 하나로 모은다.
 */
export function CreateContentMenu({ trigger, onSelect, extraItems = [] }: CreateContentMenuProps) {
  return (
    <Dropdown
      trigger={trigger}
      items={[
        {
          label: "페이지",
          icon: <FileText size={16} aria-hidden="true" />,
          // 초안으로 즉시 만들어 트리에 세운다 — 빈 편집 화면만 열면 뭘 만드는지 확인이 안 된다
          onSelect: () => onSelect("page"),
        },
        {
          label: "폴더",
          icon: <Folder size={16} aria-hidden="true" />,
          onSelect: () => onSelect("folder"),
        },
        ...extraItems,
      ]}
    />
  );
}
