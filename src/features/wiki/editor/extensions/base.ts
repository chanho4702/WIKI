import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { common, createLowlight } from "lowlight";
import Link from "@tiptap/extension-link";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import { ColorTableCell, ColorTableHeader } from "./tableCellColor";
import { BookmarkCard } from "./bookmarkCard";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { Markdown } from "tiptap-markdown";
import { WikiLink } from "./wikiLink";
import { Column, ColumnBlock } from "./columns";
import { Details } from "./details";
import { UserMention } from "./userMention";
import { DateMention } from "./dateMention";
import { BgColor, TextColor } from "./textColors";
import { CodeBlockView } from "../components/CodeBlockView";
import { ImageView } from "../components/ImageView";
import type { WikiLinkTarget } from "../../lib/wikiLinks";

/** highlight.js common 언어 세트 — 뷰(rehype-highlight)와 동일한 hljs-* 토큰 클래스를 생성한다 */
const lowlight = createLowlight(common);
// mermaid 코드 블록(W27-2)은 보기에서 다이어그램이 되지만 편집기에선 텍스트다 — lowlight가 모르는
// 언어라 자동 감지가 엉뚱한 토큰 색을 입히던 것을 plaintext 별칭으로 막는다(스키마 무관).
lowlight.registerAlias("plaintext", ["mermaid"]);

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

  /**
   * 이미지는 블록 노드인데 tiptap-markdown에 직렬화기가 없어 HTML 폴백으로 나갔고, 그 폴백이
   * 블록을 닫지 않아 **바로 뒤 문단이 이미지 줄에 들러붙었다** — `![a](x)\n\n문단`을 편집기에
   * 한 번 통과시키면 `![a](x)문단`이 되어 문단이 사라진 것처럼 보인다(2026-09-05 실측).
   * 여기서 블록을 명시적으로 닫아 이미지 뒤의 빈 줄을 지킨다.
   */
  addStorage() {
    return {
      markdown: {
        serialize(
          state: { write: (s: string) => void; closeBlock: (node: unknown) => void },
          node: { attrs: { src?: string; alt?: string; title?: string } },
        ) {
          const alt = node.attrs.alt ?? "";
          const title = node.attrs.title ? ` "${node.attrs.title.replace(/"/g, '\\"')}"` : "";
          state.write(`![${alt}](${node.attrs.src ?? ""}${title})`);
          state.closeBlock(node);
        },
      },
    };
  },
});

export interface BaseExtensionOptions {
  /**
   * 존재/부재 페이지 판별용 — 없으면 항상 빈 목록(모두 부재 처리).
   * 스페이스 전량이 아니라 **문서에 등장한 제목의 조회 결과**를 준다(2026-08-28).
   */
  getPages?: () => WikiLinkTarget[];
  /** Yjs Collaboration이 자체 undo manager를 쓸 때 StarterKit history를 중복 등록하지 않는다. */
  history?: boolean;
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
      ...(options.history === false ? { history: false } : {}),
    }),
    CodeBlockWithView,
    // protocols: 멘션 저장 문법 `[@이름](user:id)`의 `user:` 스킴 — Link 확장의 보안 검증
    // (isAllowedUri)이 미등록 스킴 href를 버리면 멘션이 텍스트로 열화된다(userMention.ts 참조).
    // `attachment:`는 이관(W29)이 쓴다: 첨부 본체가 아직 안 넘어온 문서의 참조를 `[파일명](attachment:파일명)`로
    // 남기는데, 스킴이 등록돼 있지 않으면 편집기를 한 번 지나는 순간 링크가 맨 텍스트로 뭉개진다.
    Link.configure({ openOnClick: false, protocols: ["user", "date", "attachment"] }),
    // resizable: 편집 중 열 너비 드래그(컨플식). 폭은 GFM에 저장 문법이 없어 세션 한정 —
    // 영속하려면 저장 포맷 확장이 필요하다(분석서 "열린 정책 결정"에 기록).
    Table.configure({ resizable: true }),
    TableRow,
    // 셀 배경색 attr(bgColor) 확장 — 저장은 `{.bg-색}` 셀 마커(tableCellColor.ts 참조)
    ColorTableHeader,
    ColorTableCell,
    TaskList,
    // 중첩 허용 — Notion·Confluence 모두 체크리스트 하위 항목을 지원한다(동등성 Must 6).
    // 저장은 표준 마크다운 들여쓰기 `- [ ]`라 왕복·기존 문서에 영향이 없다.
    TaskItem.configure({ nested: true }),
    ImageWithView,
    // 레이어 분할 — 스키마에 영향을 주므로 화면(WikiEditor)이 아니라 여기(공용 목록)에 둔다.
    // markdown.ts의 헤드리스 변환기도 같은 노드를 봐야 `::::columns` 왕복이 성립한다.
    ColumnBlock,
    Column,
    // 토글(expand) — 저장은 `:::details[제목]` 확장 문법(extensions/details.ts)
    Details,
    BookmarkCard,
    // 사용자 멘션 — 저장은 표준 링크 `[@이름](user:id)`(extensions/userMention.ts)
    UserMention,
    // 날짜 요소 — 저장은 표준 링크 `[ISO](date:ISO)`(extensions/dateMention.ts)
    DateMention,
    // 글자색·배경색 — 저장은 텍스트 지시자 `:c[..]{.red}`/`:bg[..]{.yellow}`(extensions/textColors.ts)
    TextColor,
    BgColor,
    Markdown.configure({
      html: false, // 생 HTML은 텍스트로 보존 (손실 정책)
      linkify: false,
      transformPastedText: true,
    }),
    WikiLink.configure({ getPages: options.getPages ?? (() => []) }),
  ];
}
