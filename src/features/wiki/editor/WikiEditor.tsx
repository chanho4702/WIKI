import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import GlobalDragHandle from "tiptap-extension-global-drag-handle";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Page } from "../store/types";
import { buildBaseExtensions } from "./extensions/base";
import { WikiLinkSuggestion } from "./extensions/wikiLinkSuggestion";
import { SlashMenu, type SlashItem } from "./extensions/slashMenu";
import { AlertDecoration } from "./extensions/alertDecoration";
import { ColumnDrag } from "./extensions/columnDrag";
import { SuggestionPopup } from "./components/SuggestionPopup";
import { BubbleToolbar } from "./components/BubbleToolbar";
import { TopToolbar } from "./components/TopToolbar";
import { parseMarkdown, serializeMarkdown } from "./markdown";
import { editorRegistry } from "./editorTestRegistry";
import { deleteAttachment, inlineAttachmentUrl, uploadAttachment } from "../store/wikiStore";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface WikiEditorHandle {
  /** 현재 문서를 마크다운으로 직렬화 — 저장 시점에만 호출한다 */
  getMarkdown(): string;
  /** 본문이 한 번이라도 변경됐는지 — false면 호출부가 원문을 그대로 저장한다 */
  isDirty(): boolean;
  /** 저장된 본문에서 제거된 신규 업로드를 삭제하고, 나머지를 저장 완료로 확정한다. */
  finalizePendingUploads(): Promise<void>;
  /** 저장하지 않고 나갈 때 이 편집 세션에서 올린 객체를 정리한다. */
  discardPendingUploads(): Promise<void>;
}

export interface WikiEditorProps {
  initialMarkdown: string;
  /** [[링크]] 존재/부재 판별 + 자동완성 후보 */
  pages: Page[];
  /** 첨부 업로드 대상. 신규 페이지처럼 아직 ID가 없으면 파일 업로드를 막는다. */
  pageId?: string;
  /**
   * 본문이 처음 수정될 때 한 번 호출된다 — 편집 크롬의 저장 상태 표시용.
   * dirtyRef는 ref라 렌더를 유발하지 않으므로, 상태 표시가 필요한 호출부는 이 콜백을 쓴다.
   * (매 키 입력마다 부모를 리렌더시키지 않기 위해 "false → true" 전이에서만 알린다.)
   */
  onDirty?: () => void;
  onUploadStateChange?: (uploading: boolean) => void;
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
  function WikiEditor({ initialMarkdown, pages, pageId, onDirty, onUploadStateChange }, ref) {
    // onUpdate는 useEditor 설정 시점에 캡처되므로 콜백을 ref로 최신화한다(재구독 없이).
    const onDirtyRef = useRef(onDirty);
    onDirtyRef.current = onDirty;
    const pagesRef = useRef(pages);
    pagesRef.current = pages;
    const dirtyRef = useRef(false);
    // 이 컴포넌트 인스턴스가 만든 에디터 식별용 — onDestroy가 다른(더 최신) 인스턴스의
    // 레지스트리 등록을 잘못 지우지 않도록 신원을 대조한다 (비동기 create/destroy 경합 방지)
    const selfEditorRef = useRef<Editor | null>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    // 이번 편집 세션에서 업로드한 attachment id→본문 URL. 저장 성공/취소 시 정리 정책의 근거다.
    const pendingUploadsRef = useRef(new Map<string, string>());
    const [uploadsInFlight, setUploadsInFlight] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
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
    // 이모지 피커(W6 T4) 열림 상태 — TopToolbar의 이모지 버튼과 슬래시 메뉴 "이모지" 항목이
    // 같은 팝오버를 공유하므로 여기(WikiEditor)로 끌어올린다. SlashMenu 확장은 useEditor 안에서
    // 구성되므로 TopToolbar가 마운트되기 전에 이미 이 상태의 setter를 필요로 한다.
    const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

    const editor = useEditor({
      immediatelyRender: true,
      extensions: [
        ...buildBaseExtensions({ getPages: () => pagesRef.current }),
        Placeholder.configure({ placeholder: "내용을 입력하세요. '/'로 블록을 추가합니다." }),
        WikiLinkSuggestion.configure({
          getPages: () => pagesRef.current,
          onStateChange: setLinkMenu,
        }),
        SlashMenu.configure({
          onStateChange: setSlashMenu,
          onOpenEmoji: () => setEmojiPickerOpen(true),
          onUploadImage: () => imageInputRef.current?.click(),
        }),
        AlertDecoration,
        // 열 너비 조절·열 재배치·끌어서 분할. 스키마에 영향이 없는 뷰 전용이라 base.ts가 아니라
        // 여기에 둔다(마크다운 왕복 계약과 무관).
        ColumnDrag,
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
        const wasClean = !dirtyRef.current;
        dirtyRef.current = true;
        if (wasClean) onDirtyRef.current?.();
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
      finalizePendingUploads: async () => {
        const markdown = serializeMarkdown(editor.getJSON());
        const unused = [...pendingUploadsRef.current]
          .filter(([, url]) => !markdown.includes(url))
          .map(([id]) => id);
        pendingUploadsRef.current.clear();
        await Promise.allSettled(unused.map((id) => deleteAttachment(id)));
      },
      discardPendingUploads: async () => {
        const ids = [...pendingUploadsRef.current.keys()];
        pendingUploadsRef.current.clear();
        await Promise.allSettled(ids.map((id) => deleteAttachment(id)));
      },
    }));

    const uploadImages = async (files: File[], position?: number) => {
      if (!editor) return;
      if (!pageId) {
        setUploadError("이미지를 올리려면 페이지를 먼저 저장해야 합니다.");
        return;
      }
      const images = files.filter((file) => INLINE_IMAGE_TYPES.has(file.type));
      if (images.length !== files.length) {
        setUploadError("PNG, JPEG, GIF, WebP 이미지만 올릴 수 있습니다.");
      } else {
        setUploadError(null);
      }

      let insertAt = position;
      for (const file of images) {
        setUploadsInFlight((count) => count + 1);
        let attachmentId: string | null = null;
        try {
          const attachment = await uploadAttachment(pageId, file);
          attachmentId = attachment.id;
          // 확장자·브라우저 MIME이 아니라 서버 탐지 결과로 최종 판정한다.
          if (!INLINE_IMAGE_TYPES.has(attachment.contentType)) {
            await deleteAttachment(attachment.id).catch(() => undefined);
            attachmentId = null;
            throw new Error("서버가 안전한 이미지 형식으로 확인하지 못했습니다.");
          }
          const src = inlineAttachmentUrl(attachment.id);
          if (editor.isDestroyed) {
            await deleteAttachment(attachment.id).catch(() => undefined);
            attachmentId = null;
            continue;
          }
          const inserted = insertAt === undefined
            ? editor.chain().focus().setImage({ src, alt: file.name }).run()
            : editor.chain().focus().insertContentAt(insertAt, {
                type: "image",
                attrs: { src, alt: file.name },
              }).run();
          if (!inserted) {
            await deleteAttachment(attachment.id).catch(() => undefined);
            attachmentId = null;
            throw new Error("이미지를 문서에 삽입하지 못했습니다.");
          }
          pendingUploadsRef.current.set(attachment.id, src);
          if (insertAt !== undefined) insertAt += 1;
        } catch (error) {
          if (attachmentId) await deleteAttachment(attachmentId).catch(() => undefined);
          setUploadError(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
        } finally {
          setUploadsInFlight((count) => Math.max(0, count - 1));
        }
      }
    };

    const filesFrom = (list: FileList): File[] => Array.from(list);
    const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.currentTarget.files ? filesFrom(event.currentTarget.files) : [];
      event.currentTarget.value = "";
      if (files.length) void uploadImages(files);
    };
    const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
      const files = filesFrom(event.clipboardData.files);
      if (!files.length) return;
      event.preventDefault();
      void uploadImages(files);
    };
    const handleDrop = (event: DragEvent<HTMLDivElement>) => {
      const files = filesFrom(event.dataTransfer.files);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      const position = editor?.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
      void uploadImages(files, position);
    };

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

    useEffect(() => {
      onUploadStateChange?.(uploadsInFlight > 0);
    }, [onUploadStateChange, uploadsInFlight]);

    return (
      <div
        className={`wiki-editor${uploadsInFlight ? " wiki-editor--uploading" : ""}`}
        onPaste={handlePaste}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={handleDrop}
      >
        <input
          ref={imageInputRef}
          className="wiki-editor-image-input"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          tabIndex={-1}
          aria-label="이미지 파일 선택"
          onChange={handleFileInput}
        />
        {editor && (
          <TopToolbar
            editor={editor}
            emojiPickerOpen={emojiPickerOpen}
            onEmojiPickerOpenChange={setEmojiPickerOpen}
            onUploadImage={() => imageInputRef.current?.click()}
          />
        )}
        <EditorContent editor={editor} />
        <div className="wiki-editor-upload-status" aria-live="polite">
          {uploadsInFlight > 0 ? `이미지 ${uploadsInFlight}개 업로드 중…` : null}
        </div>
        {uploadError && <div className="wiki-editor-upload-error" role="alert">{uploadError}</div>}
        {editor && <BubbleToolbar editor={editor} />}
        {/* 위치 보정(아래 공간 부족 시 캐럿 위로 뒤집기·가로 clamp)은 SuggestionPopup이 한다 —
            캐럿 rect만 넘기고 어디에 그릴지는 팝업이 스스로 정한다. */}
        {linkMenu && linkMenu.clientRect && (
          <SuggestionPopup
            ariaLabel="페이지 링크 자동완성"
            items={linkMenu.items.map((p) => ({ id: p.id, label: p.title }))}
            highlight={linkMenu.highlight}
            anchor={{
              top: linkMenu.clientRect.top,
              bottom: linkMenu.clientRect.bottom,
              left: linkMenu.clientRect.left,
            }}
            onPick={(i) => linkMenu.command(linkMenu.items[i])}
          />
        )}
        {slashMenu && slashMenu.clientRect && (
          <SuggestionPopup
            ariaLabel="블록 삽입 메뉴"
            items={slashMenu.items}
            highlight={slashMenu.highlight}
            anchor={{
              top: slashMenu.clientRect.top,
              bottom: slashMenu.clientRect.bottom,
              left: slashMenu.clientRect.left,
            }}
            onPick={(i) => slashMenu.command(slashMenu.items[i])}
          />
        )}
      </div>
    );
  },
);
