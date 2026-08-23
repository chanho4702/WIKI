import { Modal } from "@chanho/react";
import { SLASH_ITEMS } from "../editor/extensions/slashMenu";

/**
 * 단축키 도움말 — 표기는 slashMenu.ts의 shortcut 필드가 단일 원천이다(블록 항목).
 * 마크다운 자동 서식·트리거는 코드에 표기 필드가 없어 여기서 고정 표로 안내한다.
 */
const TRIGGER_ROWS: Array<[string, string]> = [
  ["/", "블록 삽입 메뉴"],
  ["//", "날짜 캘린더"],
  ["@", "사용자 멘션"],
  ["[[", "페이지 링크"],
  ["# + 공백", "제목 (## 제목2, ### 제목3)"],
  ["- + 공백", "글머리 목록"],
  ["1. + 공백", "번호 목록"],
  ["> + 공백", "인용"],
  ["``` ", "코드 블록"],
];

export interface ShortcutHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelpModal({ open, onOpenChange }: ShortcutHelpModalProps) {
  const blockRows = SLASH_ITEMS.filter((item) => item.shortcut);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="단축키 도움말">
      <div className="shortcut-help">
        <section aria-label="입력 트리거">
          <h3>입력 트리거</h3>
          <table>
            <tbody>
              {TRIGGER_ROWS.map(([keys, label]) => (
                <tr key={keys}>
                  <td>
                    <kbd>{keys}</kbd>
                  </td>
                  <td>{label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section aria-label="블록 단축키">
          <h3>블록 단축키</h3>
          <table>
            <tbody>
              {blockRows.map((item) => (
                <tr key={item.id}>
                  <td>
                    <kbd>{item.shortcut}</kbd>
                  </td>
                  <td>{item.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </Modal>
  );
}
