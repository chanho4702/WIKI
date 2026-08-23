import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ChevronRight } from "lucide-react";
import { sanitizeSummary } from "../extensions/details";

/**
 * 토글 NodeView — chevron + 제목 input + 접히는 내용.
 *
 * 열림/닫힘은 로컬 상태다(저장 안 함 — extensions/details.ts 참조). 편집 중 기본 펼침:
 * 접힌 채로 두면 내용을 편집할 수 없고, Notion 편집 화면의 기본과도 같다.
 * 접힌 상태에서도 내용 노드는 DOM에 남긴다(display:none) — ProseMirror가 자식 뷰를
 * 언마운트하면 커서·협업 상태가 흔들린다.
 */
export function DetailsView({ node, updateAttributes, editor }: NodeViewProps) {
  const [open, setOpen] = useState(true);
  const summary = (node.attrs.summary as string) ?? "";

  return (
    <NodeViewWrapper className={`details-block${open ? " details-block--open" : ""}`}>
      <div className="details-block-header" contentEditable={false}>
        <button
          type="button"
          className="details-block-chevron"
          aria-expanded={open}
          aria-label={open ? "토글 접기" : "토글 펼치기"}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight size={16} aria-hidden />
        </button>
        <input
          className="details-block-summary"
          aria-label="토글 제목"
          placeholder="토글 제목"
          value={summary}
          readOnly={!editor.isEditable}
          onChange={(e) => updateAttributes({ summary: sanitizeSummary(e.target.value) })}
        />
      </div>
      <div className="details-block-content" hidden={!open}>
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
}
