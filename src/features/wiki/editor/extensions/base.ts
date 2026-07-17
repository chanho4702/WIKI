import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlock from "@tiptap/extension-code-block";
import { ReactNodeViewRenderer } from "@tiptap/react";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { WikiLink } from "./wikiLink";
import { CodeBlockView } from "../components/CodeBlockView";
import type { Page } from "../../store/types";

/** 언어 선택 + 복사 버튼 NodeView가 붙은 코드 블록 — StarterKit 기본 codeBlock을 대체한다 */
const CodeBlockWithView = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

export interface BaseExtensionOptions {
  /** 존재/부재 페이지 판별용 — 없으면 항상 빈 목록(모두 부재 처리) */
  getPages?: () => Page[];
}

/**
 * 에디터·마크다운 변환 공용 확장 목록.
 * 스키마에 영향을 주는 확장은 반드시 여기에만 추가한다 —
 * WikiEditor와 markdown.ts의 헤드리스 에디터가 같은 스키마를 봐야 왕복이 안전하다.
 */
export function buildBaseExtensions(options: BaseExtensionOptions = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
    }),
    CodeBlockWithView,
    Link.configure({ openOnClick: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: false }),
    Image,
    Markdown.configure({
      html: false, // 생 HTML은 텍스트로 보존 (손실 정책)
      linkify: false,
      transformPastedText: true,
    }),
    WikiLink.configure({ getPages: options.getPages ?? (() => []) }),
  ];
}
