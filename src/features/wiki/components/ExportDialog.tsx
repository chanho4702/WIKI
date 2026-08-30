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
import { USE_BACKEND } from "../store/apiClient";
import { downloadPagePdf } from "../store/wikiStore";

/**
 * 내보내기(W21-3). Markdown은 저장 형식 그대로라 무손실이고, HTML은 받는 사람이 그냥 열 수
 * 있도록 이미지를 파일 안에 심는다.
 *
 * PDF는 서버 렌더러(W26, flexmark + openhtmltopdf — 2026-08-31 사용자 요청)가 만든다. 예전에는
 * 브라우저 인쇄로 넘겼는데, 인쇄는 브라우저·용지 설정마다 결과가 다르고 하위 문서 묶음을 한
 * 파일로 만들 수 없었다. 목업 모드에는 서버가 없어 인쇄 버튼을 그대로 둔다.
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

  const runPdf = async () => {
    setBusy(true);
    try {
      await downloadPagePdf(page.id, includeChildren, page.title);
      onOpenChange(false);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

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
          {USE_BACKEND ? (
            <Button variant="subtle" disabled={busy} onClick={() => void runPdf()}>
              PDF
            </Button>
          ) : (
            <Button variant="subtle" disabled={busy} onClick={() => window.print()}>
              인쇄 (PDF로 저장)
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
