import { Extension } from "@tiptap/core";
import { SLASH_ITEMS } from "./slashMenu";

/**
 * 커스텀 블록 단축키 — Tiptap 기본(제목 Mod-Alt-1~3, 목록 Mod-Shift-7/8/9, 인용 Mod-Shift-B,
 * 코드 블록 Mod-Alt-C)에 없는 우리 블록만 보탠다. 표기는 슬래시 메뉴 뱃지·단축키 도움말과
 * 한 곳(slashMenu.ts의 shortcut 필드)에서 관리한다 — 여기 바인딩과 표기가 갈리면 도움말이 거짓말이 된다.
 */
export const BlockShortcuts = Extension.create({
  name: "blockShortcuts",

  addKeyboardShortcuts() {
    const runItem = (id: string) => () => {
      const item = SLASH_ITEMS.find((entry) => entry.id === id);
      if (!item || item.action) return false; // action형(이모지 등)은 편집 명령이 아니다
      item.run(this.editor);
      return true;
    };
    return {
      "Mod-Alt-d": runItem("toggle"), // 토글
      "Mod-Alt-t": runItem("table"), // 표
      "Mod-Alt-p": runItem("note"), // 정보 패널
    };
  },
});
