import { useCallback, useEffect, useRef, useState } from "react";
import { Button, useToast } from "@chanho/react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import type { Attachment } from "../store/types";
import {
  attachmentIdFromInlineUrl,
  attachmentUrl,
  deleteAttachment,
  inlineAttachmentUrl,
  listAttachments,
  uploadAttachment,
} from "../store/wikiStore";

/** 1.2 MB처럼 사람이 읽는 크기. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

/**
 * 페이지 첨부파일(W21-3) — 컨플루언스의 첨부 탭에 해당한다.
 *
 * 지금까지 파일을 올릴 유일한 경로는 에디터의 이미지 업로드였다. 이미지가 아닌 파일(PDF·엑셀)은
 * 본문에 넣을 수 없어 애초에 올릴 방법이 없었다 — 문서 시스템으로서 큰 구멍이다.
 *
 * 본문이 참조 중인 파일을 지우면 이미지가 깨지므로, 지우기 전에 그 사실을 알린다.
 */
export function PageAttachments({ pageId, body }: { pageId: string; body: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Attachment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setItems(await listAttachments(pageId));
    } catch {
      setItems([]); // 첨부를 못 읽는다고 본문 화면을 막지 않는다
    }
  }, [pageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) await uploadAttachment(pageId, file);
      await reload();
      toast({ title: `${files.length}개 파일을 첨부했습니다`, appearance: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const remove = async (attachment: Attachment) => {
    const referenced = body.includes(inlineAttachmentUrl(attachment.id));
    const warning = referenced
      ? `"${attachment.filename}"은(는) 본문에서 사용 중입니다. 지우면 본문의 이미지가 깨집니다. 계속할까요?`
      : `"${attachment.filename}"을(를) 삭제합니다.`;
    if (!window.confirm(warning)) return;
    setBusy(true);
    try {
      await deleteAttachment(attachment.id);
      await reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (items === null) return null;

  return (
    <section className="page-attachments" aria-label="첨부파일">
      <div className="page-attachments-head">
        <h2 className="page-attachments-title">
          <Paperclip size={16} aria-hidden="true" />
          첨부파일 {items.length > 0 ? `(${items.length})` : ""}
        </h2>
        <Button
          size="small"
          variant="subtle"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          파일 첨부
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="wiki-visually-hidden"
          aria-label="첨부할 파일 선택"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {items.length === 0 ? (
        <p className="page-attachments-empty">첨부된 파일이 없습니다.</p>
      ) : (
        <ul className="page-attachments-list">
          {items.map((attachment) => (
            <li key={attachment.id}>
              <a href={attachmentUrl(attachment.id)} download={attachment.filename}>
                <Download size={14} aria-hidden="true" />
                {attachment.filename}
              </a>
              <span className="page-attachments-meta">
                {formatSize(attachment.sizeBytes)}
                {attachmentIdFromInlineUrl(inlineAttachmentUrl(attachment.id)) !== null &&
                body.includes(inlineAttachmentUrl(attachment.id))
                  ? " · 본문에서 사용 중"
                  : ""}
              </span>
              <button
                type="button"
                className="page-attachments-remove"
                aria-label={`${attachment.filename} 삭제`}
                disabled={busy}
                onClick={() => void remove(attachment)}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
