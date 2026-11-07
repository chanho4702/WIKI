import { useRef, useState } from "react";
import { Banner, Button, Checkbox, Modal, useToast } from "@chanho/react";
import { FileText } from "lucide-react";
import type { Page } from "../store/types";
import { importMarkdownFiles } from "../store/wikiStore";
import {
  MARKDOWN_IMPORT_ACCEPT,
  MARKDOWN_IMPORT_MAX_FILES,
  isMarkdownFileName,
} from "../lib/markdownImport";

/**
 * Markdown 가져오기 — .md 파일마다 새 문서 하나(부모 아래, 형제 맨 뒤). 제목은 앞머리 title → 맨 앞 `# 제목` →
 * 파일 이름 순이다. 하나라도 거부되면 아무것도 만들지 않으므로 오류는 대화상자 안에 남겨 고르기를 다시 하게 한다.
 * 상대 경로 이미지는 가져오지 못한다 — 서버가 준 파일별 경고를 토스트로 알린다.
 */
export function MarkdownImportDialog({
  open,
  onOpenChange,
  spaceId,
  parent,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  /** null이면 스페이스 최상위에 만든다. */
  parent: Pick<Page, "id" | "title"> | null;
  onImported: (pages: Page[]) => void;
}) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFiles([]);
    setDraft(false);
    setError(null);
    if (input.current) input.current.value = "";
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const choose = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    setError(null);
    const rejected = picked.filter((f) => !isMarkdownFileName(f.name));
    if (rejected.length > 0) {
      setError(`Markdown 파일(.md, .markdown)만 가져올 수 있습니다: ${rejected.map((f) => f.name).join(", ")}`);
    } else if (picked.length > MARKDOWN_IMPORT_MAX_FILES) {
      setError(`한 번에 ${MARKDOWN_IMPORT_MAX_FILES}개까지 가져올 수 있습니다`);
    }
    setFiles(picked);
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await importMarkdownFiles(spaceId, parent?.id ?? null, files, { draft });
      toast({ title: `문서 ${result.pages.length}개를 가져왔습니다`, appearance: "success" });
      for (const w of result.warnings) {
        toast({ title: w.file, description: w.message, appearance: "info" });
      }
      reset();
      onOpenChange(false);
      onImported(result.pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const invalid =
    files.length === 0 ||
    files.length > MARKDOWN_IMPORT_MAX_FILES ||
    files.some((f) => !isMarkdownFileName(f.name));

  return (
    <Modal
      open={open}
      onOpenChange={close}
      title="Markdown 가져오기"
      description={
        parent
          ? `"${parent.title}" 아래에 파일마다 새 문서를 만듭니다.`
          : "스페이스 최상위에 파일마다 새 문서를 만듭니다."
      }
    >
      <div className="markdown-import-dialog">
        <div className="markdown-import-pick">
          <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            파일 선택
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept={MARKDOWN_IMPORT_ACCEPT}
            className="wiki-visually-hidden"
            aria-label="가져올 Markdown 파일 선택"
            onChange={(e) => choose(e.target.files)}
          />
          <span className="markdown-import-hint">
            .md 파일 최대 {MARKDOWN_IMPORT_MAX_FILES}개, 파일당 1MB · 상대 경로 이미지는 가져오지 않습니다
          </span>
        </div>
        {files.length > 0 ? (
          <ul className="markdown-import-files" aria-label="선택한 파일">
            {files.map((f) => (
              <li key={`${f.name}-${f.size}-${f.lastModified}`}>
                <FileText size={14} aria-hidden="true" />
                {f.name}
              </li>
            ))}
          </ul>
        ) : null}
        <Checkbox
          label="초안으로 가져오기 (나와 관리자만 보임)"
          checked={draft}
          onCheckedChange={(checked) => setDraft(checked === true)}
        />
        {error ? <Banner variant="danger">{error}</Banner> : null}
        <div className="markdown-import-actions">
          <Button variant="subtle" disabled={busy} onClick={() => close(false)}>
            취소
          </Button>
          <Button disabled={busy || invalid} onClick={() => void run()}>
            가져오기
          </Button>
        </div>
      </div>
    </Modal>
  );
}
