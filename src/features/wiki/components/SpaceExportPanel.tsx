import { useEffect, useState } from "react";
import { Button, useToast } from "@chanho/react";
import { Download } from "lucide-react";
import {
  buildSpaceHtmlExport,
  buildSpaceMarkdownExport,
  countForSpaceExport,
  downloadFile,
  toFileName,
} from "../lib/exportContent";

/**
 * 스페이스 내보내기(W23) — 스페이스 설정의 한 판.
 *
 * 문서 하나(하위 포함)씩만 내보낼 수 있어서 스페이스를 통째로 백업하거나 옮기려면 루트마다
 * 반복해야 했다. 형식은 문서 내보내기와 같다(Markdown 무손실 · HTML 이미지 내장) — 파이프라인을
 * 새로 두면 확장 문법에서 결과가 어긋난다.
 */
export function SpaceExportPanel({ spaceId, spaceName }: { spaceId: string; spaceName: string }) {
  const toast = useToast();
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void countForSpaceExport(spaceId)
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [spaceId]);

  const run = async (format: "md" | "html") => {
    setBusy(true);
    try {
      if (format === "md") {
        downloadFile(toFileName(spaceName, "md"), await buildSpaceMarkdownExport(spaceId), "text/markdown");
      } else {
        downloadFile(toFileName(spaceName, "html"), await buildSpaceHtmlExport(spaceId, spaceName), "text/html");
      }
      toast({ title: "스페이스를 내보냈습니다", appearance: "success" });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-settings-form" aria-label="스페이스 내보내기">
      <h2 className="space-export-title">스페이스 내보내기</h2>
      <p className="space-export-desc">
        {count === null ? "살아 있는 문서 전부를 한 파일로 저장합니다." : `문서 ${count}개를 한 파일로 저장합니다.`}
        {" "}보관함·휴지통의 문서는 빠집니다.
      </p>
      <div className="export-dialog-actions">
        <Button disabled={busy || count === 0} iconBefore={<Download size={14} aria-hidden="true" />} onClick={() => void run("md")}>
          Markdown
        </Button>
        <Button variant="secondary" disabled={busy || count === 0} onClick={() => void run("html")}>
          HTML
        </Button>
      </div>
    </div>
  );
}
