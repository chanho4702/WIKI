import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { Link as LinkIcon, CreditCard, Type } from "lucide-react";
import { getPage } from "../../store/wikiStore";
import type { UrlPasteInfo } from "../extensions/urlPaste";
import { BOOKMARK_NAME } from "../extensions/bookmarkCard";

/**
 * 내부 페이지 URL(/wiki/spaces/{s}/pages/{p})이면 그 페이지 id, 아니면 null.
 * 제목은 여기서 알 수 없다 — 예전에는 스페이스 전 페이지 배열에서 찾았지만, 이제 id만 뽑고
 * 제목은 필요할 때 서버에서 읽는다(2026-08-28).
 */
export function internalPageIdOf(url: string): string | null {
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    const m = /\/wiki\/spaces\/[^/]+\/pages\/([^/?#]+)/.exec(u.pathname);
    return m ? m[1] : null;
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
  anchor: { left: number; bottom: number };
  onClose: () => void;
}

/**
 * URL 붙여넣기 직후 뜨는 형식 전환 메뉴(컨플루언스 참조) — URL(기본, 이미 삽입됨) /
 * 인라인 제목(내부 페이지는 [[위키링크]], 외부는 호스트명 링크) / 미리보기 카드(::bookmark).
 * 다른 입력이 시작되면(문서 변경) WikiEditor가 닫는다 — 메뉴는 순간의 선택지다.
 */
export function PasteLinkMenu({ editor, info, anchor, onClose }: PasteLinkMenuProps) {
  const internalId = internalPageIdOf(info.url);
  // 내부 페이지면 제목을 읽어 [[위키링크]]로 바꿔준다. 조회 전에는 호스트명 폴백을 보여준다.
  const [internal, setInternal] = useState<{ title: string } | null>(null);
  useEffect(() => {
    if (internalId === null) {
      setInternal(null);
      return;
    }
    let cancelled = false;
    void getPage(internalId)
      .then((page) => {
        if (!cancelled && page) setInternal({ title: page.title });
      })
      .catch(() => {
        if (!cancelled) setInternal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [internalId]);
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
