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
import type { Editor, Extensions } from "@tiptap/core";
import type { ReactNode } from "react";
import type { Attachment, Page, User } from "../store/types";
import { buildBaseExtensions } from "./extensions/base";
import { WikiLinkSuggestion } from "./extensions/wikiLinkSuggestion";
import { UserMentionSuggestion } from "./extensions/userMentionSuggestion";
import { DateSuggestion } from "./extensions/dateSuggestion";
import { BlockShortcuts } from "./extensions/blockShortcuts";
import { SlashMenu, type SlashItem } from "./extensions/slashMenu";
import { AlertDecoration } from "./extensions/alertDecoration";
import { TocDecoration } from "./extensions/tocDecoration";
import { ColumnDrag } from "./extensions/columnDrag";
import { SuggestionPopup } from "./components/SuggestionPopup";
import { DatePickerPopup } from "./components/DatePickerPopup";
import { BubbleToolbar } from "./components/BubbleToolbar";
import { TopToolbar } from "./components/TopToolbar";
import { TableToolbar } from "./components/TableToolbar";
import {
  UploadRail,
  type ImageUploadTaskView,
} from "./components/UploadRail";
import { safeParse, serializeMarkdown } from "./markdown";
import { editorRegistry } from "./editorTestRegistry";
import {
  confirmAttachments,
  deleteAttachment,
  inlineAttachmentUrl,
  uploadAttachment,
} from "../store/wikiStore";

const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

interface ImageUploadTask extends ImageUploadTaskView {
  file: File;
}

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
  /** `@` 멘션 자동완성 후보 — org 사용자 디렉터리. 생략하면 멘션 팝업이 뜨지 않는다. */
  users?: User[];
  /** 첨부 업로드 대상. 신규 페이지처럼 아직 ID가 없으면 파일 업로드를 막는다. */
  pageId?: string;
  /**
   * 본문이 처음 수정될 때 한 번 호출된다 — 편집 크롬의 저장 상태 표시용.
   * dirtyRef는 ref라 렌더를 유발하지 않으므로, 상태 표시가 필요한 호출부는 이 콜백을 쓴다.
   * (매 키 입력마다 부모를 리렌더시키지 않기 위해 "false → true" 전이에서만 알린다.)
   */
  onDirty?: () => void;
  onUploadStateChange?: (uploading: boolean) => void;
  /** 기능 플래그가 켜진 뒤 동적 로드한 Yjs/cursor 확장. 있으면 initialMarkdown을 재주입하지 않는다. */
  collaborationExtensions?: Extensions;
  /**
   * 툴바 아래·본문 위(콘텐츠 칼럼 안)에 그릴 헤더 — 컨플 편집 화면의 큰 제목 자리.
   * 툴바 줄은 전체 너비, 제목·본문은 가운데 칼럼이라 제목을 에디터 안쪽에 그려야 폭이 맞는다.
   */
  contentHeader?: ReactNode;
}

export { safeParse } from "./markdown";

export const WikiEditor = forwardRef<WikiEditorHandle, WikiEditorProps>(
  function WikiEditor({
    initialMarkdown,
    users,
    pages,
    pageId,
    onDirty,
    onUploadStateChange,
    collaborationExtensions,
    contentHeader,
  }, ref) {
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
    const activeUploadControllersRef = useRef(new Map<string, AbortController>());
    const uploadSequenceRef = useRef(0);
    const acceptingUploadsRef = useRef(true);
    const [uploadTasks, setUploadTasks] = useState<ImageUploadTask[]>([]);
    const uploadTasksRef = useRef(uploadTasks);
    uploadTasksRef.current = uploadTasks;
    const [uploadError, setUploadError] = useState<string | null>(null);
    // 멘션 후보 — pagesRef와 같은 이유(useEditor 클로저에 최신값 공급)로 ref 경유
    const usersRef = useRef<User[]>(users ?? []);
    usersRef.current = users ?? [];
    // [[ 자동완성 팝업 상태 — WikiLinkSuggestion이 onStateChange로 밀어넣는다
    const [linkMenu, setLinkMenu] = useState<{
      items: Page[];
      highlight: number;
      clientRect: DOMRect | null;
      command: (item: Page) => void;
    } | null>(null);
    // `@` 멘션 팝업 상태 — UserMentionSuggestion이 onStateChange로 밀어넣는다
    const [mentionMenu, setMentionMenu] = useState<{
      items: User[];
      highlight: number;
      clientRect: DOMRect | null;
      command: (item: User) => void;
    } | null>(null);
    // `//` 날짜 캘린더 팝업 상태 — DateSuggestion이 onStateChange로 밀어넣는다
    const [dateMenu, setDateMenu] = useState<{
      clientRect: DOMRect | null;
      command: (isoDate: string) => void;
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
        ...(collaborationExtensions
          ?? buildBaseExtensions({ getPages: () => pagesRef.current })),
        Placeholder.configure({ placeholder: "내용을 입력하세요. '/'로 블록을 추가합니다." }),
        WikiLinkSuggestion.configure({
          getPages: () => pagesRef.current,
          onStateChange: setLinkMenu,
        }),
        UserMentionSuggestion.configure({
          getUsers: () => usersRef.current,
          onStateChange: setMentionMenu,
        }),
        DateSuggestion.configure({ onStateChange: setDateMenu }),
        SlashMenu.configure({
          onStateChange: setSlashMenu,
          onOpenEmoji: () => setEmojiPickerOpen(true),
          onUploadImage: () => imageInputRef.current?.click(),
        }),
        AlertDecoration,
        TocDecoration,
        BlockShortcuts,
        // 열 너비 조절·열 재배치·끌어서 분할. 스키마에 영향이 없는 뷰 전용이라 base.ts가 아니라
        // 여기에 둔다(마크다운 왕복 계약과 무관).
        ColumnDrag,
        GlobalDragHandle.configure({
          dragHandleWidth: 20,
          scrollTreshold: 100, // 패키지 옵션명 오탈자 그대로 (upstream API)
        }),
      ],
      // collaborative document는 bootstrap+server sync가 이미 채웠다. initial content를 다시 넣으면
      // 접속자 수만큼 본문이 중복되므로 content 옵션을 완전히 생략한다.
      content: collaborationExtensions ? undefined : safeParse(initialMarkdown),
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
        acceptingUploadsRef.current = false;
        const markdown = serializeMarkdown(editor.getJSON());
        const pending = [...pendingUploadsRef.current];
        const retained = pending
          .filter(([, url]) => markdown.includes(url))
          .map(([id]) => id);
        const unused = pending
          .filter(([, url]) => !markdown.includes(url))
          .map(([id]) => id);
        pendingUploadsRef.current.clear();
        const confirmation = pageId && retained.length
          ? confirmAttachments(pageId, retained).catch((error) => {
              // 페이지 저장은 이미 성공했다. 여기서 저장 실패로 되돌리면 다음 저장이 version conflict가
              // 되므로, 서버 reconciliation이 본문을 근거로 확정하도록 넘긴다.
              console.warn("첨부 확정 요청 실패 — reconciliation에 위임합니다", error);
            })
          : Promise.resolve();
        await Promise.all([
          confirmation,
          Promise.allSettled(unused.map((id) => deleteAttachment(id))),
        ]);
      },
      discardPendingUploads: async () => {
        acceptingUploadsRef.current = false;
        activeUploadControllersRef.current.forEach((controller) => controller.abort());
        activeUploadControllersRef.current.clear();
        const ids = [...pendingUploadsRef.current.keys()];
        pendingUploadsRef.current.clear();
        await Promise.allSettled(ids.map((id) => deleteAttachment(id)));
      },
    }));

    const updateUploadTask = (
      taskId: string,
      update: Partial<Pick<ImageUploadTask, "progress" | "status" | "error">>,
    ) => {
      setUploadTasks((current) => current.map((task) => {
        if (task.id !== taskId) return task;
        if (
          update.progress === task.progress
          && update.status === undefined
          && update.error === undefined
        ) return task;
        return { ...task, ...update };
      }));
    };

    const performUpload = async (task: ImageUploadTask): Promise<Attachment | null> => {
      if (!pageId || !editor || !acceptingUploadsRef.current) return null;
      const controller = new AbortController();
      activeUploadControllersRef.current.set(task.id, controller);
      updateUploadTask(task.id, { status: "uploading", progress: 0, error: undefined });
      try {
        const attachment = await uploadAttachment(pageId, task.file, {
          pending: true,
          signal: controller.signal,
          onProgress: (progress) => updateUploadTask(task.id, { progress }),
        });
        if (!acceptingUploadsRef.current || editor.isDestroyed) {
          await deleteAttachment(attachment.id).catch(() => undefined);
          return null;
        }
        updateUploadTask(task.id, { status: "placing", progress: 100 });
        return attachment;
      } catch (error) {
        if (!acceptingUploadsRef.current) return null;
        const cancelled = error instanceof DOMException && error.name === "AbortError";
        updateUploadTask(task.id, {
          status: cancelled ? "cancelled" : "failed",
          error: cancelled
            ? undefined
            : error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.",
        });
        return null;
      } finally {
        if (activeUploadControllersRef.current.get(task.id) === controller) {
          activeUploadControllersRef.current.delete(task.id);
        }
      }
    };

    const placeUploadedImage = async (
      task: ImageUploadTask,
      attachment: Attachment,
      position?: number,
    ): Promise<boolean> => {
      // 확장자·브라우저 MIME이 아니라 서버 탐지 결과로 최종 판정한다.
      if (!INLINE_IMAGE_TYPES.has(attachment.contentType)) {
        await deleteAttachment(attachment.id).catch(() => undefined);
        updateUploadTask(task.id, {
          status: "failed",
          error: "서버가 안전한 이미지 형식으로 확인하지 못했습니다.",
        });
        return false;
      }

      const src = inlineAttachmentUrl(attachment.id);
      if (collaborationExtensions && pageId) {
        // 공유 문서에 update를 broadcast하기 전에 객체를 durable 상태로 확정한다. 로컬 세션 종료가
        // 다른 사용자가 보고 있는 이미지를 pending 정리로 삭제하는 경쟁을 막는다.
        try {
          await confirmAttachments(pageId, [attachment.id]);
        } catch (error) {
          await deleteAttachment(attachment.id).catch(() => undefined);
          updateUploadTask(task.id, {
            status: "failed",
            error: error instanceof Error ? error.message : "이미지를 확정하지 못했습니다.",
          });
          return false;
        }
      } else {
        pendingUploadsRef.current.set(attachment.id, src);
      }
      if (!acceptingUploadsRef.current || editor.isDestroyed) {
        pendingUploadsRef.current.delete(attachment.id);
        await deleteAttachment(attachment.id).catch(() => undefined);
        return false;
      }

      const inserted = position === undefined
        ? editor.chain().focus().setImage({ src, alt: task.file.name }).run()
        : editor.chain().focus().insertContentAt(position, {
            type: "image",
            attrs: { src, alt: task.file.name },
          }).run();
      if (!inserted) {
        pendingUploadsRef.current.delete(attachment.id);
        await deleteAttachment(attachment.id).catch(() => undefined);
        updateUploadTask(task.id, {
          status: "failed",
          error: "이미지를 문서에 넣지 못했습니다.",
        });
        return false;
      }

      setUploadTasks((current) => current.filter((candidate) => candidate.id !== task.id));
      return true;
    };

    const runUploadTasks = async (tasks: ImageUploadTask[], position?: number) => {
      // 전송은 독립적이므로 동시에 시작하고, 문서 삽입만 선택 순서대로 처리한다.
      const uploads = tasks.map((task) => performUpload(task));
      let insertAt = position;
      for (let index = 0; index < uploads.length; index += 1) {
        const attachment = await uploads[index];
        if (!attachment) continue;
        const inserted = await placeUploadedImage(tasks[index], attachment, insertAt);
        if (inserted && insertAt !== undefined) insertAt += 1;
      }
    };

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

      const tasks = images.map((file): ImageUploadTask => ({
        id: `image-upload-${uploadSequenceRef.current += 1}`,
        file,
        filename: file.name,
        progress: 0,
        status: "uploading",
      }));
      setUploadTasks((current) => [...current, ...tasks]);
      await runUploadTasks(tasks, position);
    };

    const cancelUpload = (taskId: string) => {
      activeUploadControllersRef.current.get(taskId)?.abort();
    };
    const retryUpload = (taskId: string) => {
      const task = uploadTasksRef.current.find((candidate) => candidate.id === taskId);
      if (!task || (task.status !== "failed" && task.status !== "cancelled")) return;
      void runUploadTasks([task]);
    };
    const dismissUpload = (taskId: string) => {
      setUploadTasks((current) => current.filter((task) => task.id !== taskId));
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
      return () => {
        acceptingUploadsRef.current = false;
        activeUploadControllersRef.current.forEach((controller) => controller.abort());
        activeUploadControllersRef.current.clear();
      };
    }, []);

    const activeUploadCount = uploadTasks.filter(
      (task) => task.status === "uploading" || task.status === "placing",
    ).length;
    const uploading = activeUploadCount > 0;

    useEffect(() => {
      onUploadStateChange?.(uploading);
    }, [onUploadStateChange, uploading]);

    return (
      <div
        className={`wiki-editor${uploading ? " wiki-editor--uploading" : ""}`}
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
        {editor && <TableToolbar editor={editor} />}
        <div className="wiki-editor-content">
          {contentHeader}
          <UploadRail
            tasks={uploadTasks}
            onCancel={cancelUpload}
            onRetry={retryUpload}
            onDismiss={dismissUpload}
          />
          <EditorContent editor={editor} />
          {uploadError && <div className="wiki-editor-upload-error" role="alert">{uploadError}</div>}
        </div>
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
        {dateMenu && dateMenu.clientRect && (
          <DatePickerPopup
            anchor={{
              top: dateMenu.clientRect.top,
              bottom: dateMenu.clientRect.bottom,
              left: dateMenu.clientRect.left,
            }}
            onPick={(iso) => dateMenu.command(iso)}
          />
        )}
        {mentionMenu && mentionMenu.clientRect && (
          <SuggestionPopup
            ariaLabel="사용자 멘션 자동완성"
            items={mentionMenu.items.map((u) => ({ id: u.id, label: u.name }))}
            highlight={mentionMenu.highlight}
            anchor={{
              top: mentionMenu.clientRect.top,
              bottom: mentionMenu.clientRect.bottom,
              left: mentionMenu.clientRect.left,
            }}
            onPick={(i) => mentionMenu.command(mentionMenu.items[i])}
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
