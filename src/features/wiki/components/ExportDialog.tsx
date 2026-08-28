import { useEffect, useState } from "react";
import { Button, Checkbox, Modal, useToast } from "@chanho/react";
import type { Page } from "../store/types";
import {
  buildHtmlExport,
  buildMarkdownExport,
  countForExport,
  downloadFile,
  toFileName,
} from "../lib/exportContent";

/**
 * 내보내기(W21-3). Markdown은 저장 형식 그대로라 무손실이고, HTML은 받는 사람이 그냥 열 수
 * 있도록 이미지를 파일 안에 심는다. PDF는 브라우저 인쇄로 넘긴다 — 자체 렌더러 없이 만든 PDF는
 * 표·코드 블록이 화면과 어긋나 오히려 못 쓴다.
 */
export function ExportDialog({
  open,
  onOpenChange,
  page,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: Page;
}) {
  const toast = useToast();
  const [includeChildren, setIncludeChildren] = useState(false);
  const [busy, setBusy] = useState(false);

  // 하위 개수는 서버에 묻는다(2026-08-28) — 화면이 스페이스 전량을 들고 있지 않다.
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void countForExport(page, includeChildren)
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch(() => {
        if (!cancelled) setCount(1);
      });
    return () => {
      cancelled = true;
    };
  }, [open, page, includeChildren]);

  const run = async (format: "md" | "html") => {
    setBusy(true);
    try {
      const input = { root: page, includeChildren };
      if (format === "md") {
        downloadFile(toFileName(page.title, "md"), await buildMarkdownExport(input), "text/markdown");
      } else {
        downloadFile(toFileName(page.title, "html"), await buildHtmlExport(input), "text/html");
      }
      onOpenChange(false);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="내보내기"
      description={`"${page.title}"을(를) 파일로 저장합니다.`}
    >
      <div className="export-dialog">
        <Checkbox
          label="하위 문서 포함"
          checked={includeChildren}
          onCheckedChange={(checked) => setIncludeChildren(checked === true)}
        />
        <p className="export-dialog-count">문서 {count}개를 내보냅니다.</p>
        <div className="export-dialog-actions">
          <Button disabled={busy} onClick={() => void run("md")}>
            Markdown
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void run("html")}>
            HTML
          </Button>
          <Button variant="subtle" disabled={busy} onClick={() => window.print()}>
            인쇄 (PDF로 저장)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
