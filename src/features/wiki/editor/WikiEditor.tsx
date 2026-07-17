import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import GlobalDragHandle from "tiptap-extension-global-drag-handle";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Page } from "../store/types";
import { buildBaseExtensions } from "./extensions/base";
import { WikiLinkSuggestion } from "./extensions/wikiLinkSuggestion";
import { SlashMenu, type SlashItem } from "./extensions/slashMenu";
import { SuggestionPopup } from "./components/SuggestionPopup";
import { BubbleToolbar } from "./components/BubbleToolbar";
import { TopToolbar } from "./components/TopToolbar";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { editorRegistry } from "./editorTestRegistry";

export interface WikiEditorHandle {
  /** 현재 문서를 마크다운으로 직렬화 — 저장 시점에만 호출한다 */
  getMarkdown(): string;
  /** 본문이 한 번이라도 변경됐는지 — false면 호출부가 원문을 그대로 저장한다 */
  isDirty(): boolean;
}

export interface WikiEditorProps {
  initialMarkdown: string;
  /** [[링크]] 존재/부재 판별 + 자동완성 후보 */
  pages: Page[];
}

/** 파싱 실패 시 원문 전체를 플레인 문단으로 — 편집이 막히지 않게 한다 (스펙 에러 처리) */
export function safeParse(md: string): JSONContent {
  try {
    return parseMarkdown(md);
  } catch (error) {
    console.warn("마크다운 파싱 실패 — 플레인 텍스트로 로드합니다", error);
    return {
      type: "doc",
      content: md.split(/\n{2,}/).map((para) => ({
        type: "paragraph",
        content: para ? [{ type: "text", text: para }] : [],
      })),
    };
  }
}

export const WikiEditor = forwardRef<WikiEditorHandle, WikiEditorProps>(
  function WikiEditor({ initialMarkdown, pages }, ref) {
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const dirtyRef = useRef(false);
    // 이 컴포넌트 인스턴스가 만든 에디터 식별용 — onDestroy가 다른(더 최신) 인스턴스의
    // 레지스트리 등록을 잘못 지우지 않도록 신원을 대조한다 (비동기 create/destroy 경합 방지)
    const selfEditorRef = useRef<Editor | null>(null);
    // [[ 자동완성 팝업 상태 — WikiLinkSuggestion이 onStateChange로 밀어넣는다
    const [linkMenu, setLinkMenu] = useState<{
      items: Page[];
      highlight: number;
      clientRect: DOMRect | null;
      command: (item: Page) => void;
    } | null>(null);
    // "/" 슬래시 메뉴 팝업 상태 — SlashMenu가 onStateChange로 밀어넣는다
    const [slashMenu, setSlashMenu] = useState<{
      items: SlashItem[];
      highlight: number;
      clientRect: DOMRect | null;
      command: (item: SlashItem) => void;
    } | null>(null);

    const editor = useEditor({
      immediatelyRender: true,
      extensions: [
        ...buildBaseExtensions({ getPages: () => pagesRef.current }),
        Placeholder.configure({ placeholder: "내용을 입력하세요. '/'로 블록을 추가합니다." }),
        WikiLinkSuggestion.configure({
          getPages: () => pagesRef.current,
          onStateChange: setLinkMenu,
        }),
        SlashMenu.configure({ onStateChange: setSlashMenu }),
        GlobalDragHandle.configure({
          dragHandleWidth: 20,
          scrollTreshold: 100, // 패키지 옵션명 오탈자 그대로 (upstream API)
        }),
      ],
      content: safeParse(initialMarkdown),
      onCreate({ editor }) {
        selfEditorRef.current = editor;
        editorRegistry.current = editor;
      },
      onUpdate() {
        dirtyRef.current = true;
      },
      onDestroy() {
        if (editorRegistry.current === selfEditorRef.current) {
          editorRegistry.current = null;
        }
      },
    });

    useImperativeHandle(ref, () => ({
      getMarkdown: () => serializeMarkdown(editor.getJSON()),
      isDirty: () => dirtyRef.current,
    }));

    // @tiptap/suggestion은 트랜잭션(state.apply) 기반이라 blur만으로는 onExit이 발화하지 않는다 —
    // 팝업이 열린 채 에디터 밖을 클릭하면 무한히 남으므로 blur 이벤트로 직접 닫는다.
    // 팝업 내부 클릭(SuggestionPopup의 onMouseDown preventDefault)은 애초에 blur를 일으키지 않으므로
    // 클릭 선택 경로와 충돌하지 않는다.
    useEffect(() => {
      if (!editor) return;
      const handleBlur = () => {
        setLinkMenu(null);
        setSlashMenu(null);
      };
      editor.on("blur", handleBlur);
      return () => {
        editor.off("blur", handleBlur);
      };
    }, [editor]);

    return (
      <div className="wiki-editor">
        {editor && <TopToolbar editor={editor} />}
        <EditorContent editor={editor} />
        {editor && <BubbleToolbar editor={editor} />}
        {linkMenu && linkMenu.clientRect && (
          <SuggestionPopup
            ariaLabel="페이지 링크 자동완성"
            items={linkMenu.items.map((p) => ({ id: p.id, label: p.title }))}
            highlight={linkMenu.highlight}
            left={linkMenu.clientRect.left}
            top={linkMenu.clientRect.bottom + 4}
            onPick={(i) => linkMenu.command(linkMenu.items[i])}
          />
        )}
        {slashMenu && slashMenu.clientRect && (
          <SuggestionPopup
            ariaLabel="블록 삽입 메뉴"
            items={slashMenu.items}
            highlight={slashMenu.highlight}
            left={slashMenu.clientRect.left}
            top={slashMenu.clientRect.bottom + 4}
            onPick={(i) => slashMenu.command(slashMenu.items[i])}
          />
        )}
      </div>
    );
  },
);
