import { forwardRef, useImperativeHandle, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Page } from "../store/types";
import { buildBaseExtensions } from "./extensions/base";
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

    const editor = useEditor({
      immediatelyRender: true,
      extensions: [
        ...buildBaseExtensions({ getPages: () => pagesRef.current }),
        Placeholder.configure({ placeholder: "내용을 입력하세요. '/'로 블록을 추가합니다." }),
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

    return (
      <div className="wiki-editor">
        <EditorContent editor={editor} />
      </div>
    );
  },
);
