import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * URL 붙여넣기 형식(컨플루언스 붙여넣기 옵션 대응) — 클립보드가 URL 하나뿐이면
 * 일단 링크된 URL 텍스트로 넣고(기본 = "URL 표시"), 삽입 범위를 콜백으로 알린다.
 * WikiEditor가 그 자리에 형식 전환 메뉴(PasteLinkMenu: URL/인라인 제목/카드)를 띄운다.
 *
 * 스키마에 영향이 없는 화면 전용 확장 — base.ts가 아니라 WikiEditor에서 등록한다.
 */

export const URL_ONLY_RE = /^https?:\/\/\S+$/;

export interface UrlPasteInfo {
  url: string;
  from: number;
  to: number;
}

export interface UrlPasteOptions {
  onPaste: (info: UrlPasteInfo) => void;
}

export const UrlPaste = Extension.create<UrlPasteOptions>({
  name: "urlPaste",

  addOptions() {
    return { onPaste: () => {} };
  },

  addProseMirrorPlugins() {
    const { onPaste } = this.options;
    return [
      new Plugin({
        key: new PluginKey("urlPaste"),
        props: {
          handlePaste: (view, event) => {
            const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
            if (!URL_ONLY_RE.test(text)) return false;
            const { state } = view;
            // 코드 블록·인라인 코드 안에서는 개입하지 않는다 — 코드는 원문 그대로가 계약
            if (state.selection.$from.parent.type.spec.code) return false;
            const linkType = state.schema.marks.link;
            if (!linkType) return false;

            const from = state.selection.from;
            const node = state.schema.text(text, [linkType.create({ href: text })]);
            view.dispatch(state.tr.replaceSelectionWith(node, false));
            onPaste({ url: text, from, to: from + text.length });
            return true;
          },
        },
      }),
    ];
  },
});
