import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
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
import { ImageView } from "../components/ImageView";
import type { Page } from "../../store/types";

/** highlight.js common 언어 세트 — 뷰(rehype-highlight)와 동일한 hljs-* 토큰 클래스를 생성한다 */
const lowlight = createLowlight(common);

/**
 * 언어 선택 + 복사 버튼 NodeView가 붙은 코드 블록 — StarterKit 기본 codeBlock을 대체한다.
 * CodeBlockLowlight는 CodeBlock을 상속해 스키마(속성 포함)가 동일하므로 markdown.ts의
 * 헤드리스 변환 에디터와 왕복 계약이 그대로 유지된다.
 */
const CodeBlockWithView = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({
  lowlight,
  // 언어 미지정 블록은 lowlight의 자동 언어 감지(highlightAuto)로 새지 않고 무하이라이트로 —
  // "plaintext"는 lowlight에 등록된 실제 언어지만 contains 규칙이 없어 토큰 span이 생기지 않는다.
  // 뷰 쪽 rehype-highlight({ detect: false })와 동일한 정책(자동 감지 끔)을 에디터에서도 지킨다.
  defaultLanguage: "plaintext",
});

/** 로드 실패 placeholder가 붙은 이미지 — 기본 Image를 대체한다 */
const ImageWithView = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
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
    ImageWithView,
    Markdown.configure({
      html: false, // 생 HTML은 텍스트로 보존 (손실 정책)
      linkify: false,
      transformPastedText: true,
    }),
    WikiLink.configure({ getPages: options.getPages ?? (() => []) }),
  ];
}
