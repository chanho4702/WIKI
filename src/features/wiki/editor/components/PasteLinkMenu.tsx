import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { Link as LinkIcon, CreditCard, Type } from "lucide-react";
import type { Page } from "../../store/types";
import type { UrlPasteInfo } from "../extensions/urlPaste";
import { BOOKMARK_NAME } from "../extensions/bookmarkCard";

/** 내부 페이지 URL(/wiki/spaces/{s}/pages/{p})이면 해당 페이지, 아니면 null. */
export function internalPageOf(url: string, pages: Page[]): Page | null {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    const m = /\/wiki\/spaces\/[^/]+\/pages\/([^/?#]+)/.exec(u.pathname);
    if (!m) return null;
    return pages.find((p) => p.id === m[1]) ?? null;
  } catch {
    return null;
  }
}

/** 외부 URL의 표시 제목 폴백 — 호스트명(www. 제거). 서버 측 메타 조회가 없어 제목을 모른다. */
export function fallbackTitleOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface PasteLinkMenuProps {
  editor: Editor;
  info: UrlPasteInfo;
  pages: Page[];
  anchor: { left: number; bottom: number };
  onClose: () => void;
}

/**
 * URL 붙여넣기 직후 뜨는 형식 전환 메뉴(컨플루언스 참조) — URL(기본, 이미 삽입됨) /
 * 인라인 제목(내부 페이지는 [[위키링크]], 외부는 호스트명 링크) / 미리보기 카드(::bookmark).
 * 다른 입력이 시작되면(문서 변경) WikiEditor가 닫는다 — 메뉴는 순간의 선택지다.
 */
export function PasteLinkMenu({ editor, info, pages, anchor, onClose }: PasteLinkMenuProps) {
  const internal = internalPageOf(info.url, pages);
  const inlineTitle = internal?.title ?? fallbackTitleOf(info.url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const applyInline = () => {
    if (internal) {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: info.from, to: info.to }, { type: "wikiLink", attrs: { title: internal.title } })
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: info.from, to: info.to },
          [{ type: "text", text: inlineTitle, marks: [{ type: "link", attrs: { href: info.url } }] }],
        )
        .run();
    }
    onClose();
  };

  const applyCard = () => {
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: info.from, to: info.to },
        { type: BOOKMARK_NAME, attrs: { url: info.url, title: internal?.title ?? fallbackTitleOf(info.url) } },
      )
      .run();
    onClose();
  };

  return (
    <div
      className="paste-link-menu"
      role="toolbar"
      aria-label="붙여넣은 링크 형식"
      style={{ left: anchor.left, top: anchor.bottom + 6 }}
    >
      <button type="button" onMouseDown={(e) => { e.preventDefault(); onClose(); }}>
        <LinkIcon size={14} aria-hidden /> URL
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); applyInline(); }}>
        <Type size={14} aria-hidden /> 인라인 {internal ? `“${internal.title}”` : `“${inlineTitle}”`}
      </button>
      <button type="button" onMouseDown={(e) => { e.preventDefault(); applyCard(); }}>
        <CreditCard size={14} aria-hidden /> 카드
      </button>
    </div>
  );
}
