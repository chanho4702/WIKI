import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useResolvedWikiImage } from "../../lib/useResolvedWikiImage";
import {
  clampImageWidth,
  parseImageWidth,
  withImageWidth,
} from "../../lib/imageAttrs";

/**
 * 이미지 NodeView — 로드 실패 placeholder + 리사이즈 핸들 + 캡션.
 *
 * - 표시 폭은 src의 `#w=` 프래그먼트에 저장한다(lib/imageAttrs.ts — 표준 마크다운 왕복 유지).
 * - 캡션은 마크다운 표준 title 속성이다(`![alt](src "캡션")`) — 직렬화 무변경.
 * - 드래그 중에는 로컬 상태로만 그리고, 놓는 순간 한 번 커밋한다 — 픽셀마다 트랜잭션을
 *   만들면 undo 스택이 드래그 한 번에 수십 개로 쪼개진다.
 */
export function ImageView({ node, updateAttributes, editor }: NodeViewProps) {
  const [failed, setFailed] = useState(false);
  const { src, alt, title } = node.attrs as { src: string; alt: string | null; title: string | null };
  const resolved = useResolvedWikiImage(src);
  const persistedWidth = parseImageWidth(src);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const editable = editor.isEditable;

  // src 변경 시 failed 상태를 리셋한다 — ReactNodeViewRenderer는 인스턴스를 재사용하므로 필요
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const width = dragWidth ?? persistedWidth;

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable) return;
    event.preventDefault();
    const startWidth = width ?? imgRef.current?.getBoundingClientRect().width ?? 400;
    dragState.current = { startX: event.clientX, startWidth };
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const onMove = (move: globalThis.PointerEvent) => {
      if (!dragState.current) return;
      setDragWidth(clampImageWidth(dragState.current.startWidth + (move.clientX - dragState.current.startX)));
    };
    const onUp = (up: globalThis.PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      if (!dragState.current) return;
      const finalWidth = clampImageWidth(
        dragState.current.startWidth + (up.clientX - dragState.current.startX),
      );
      dragState.current = null;
      setDragWidth(null);
      updateAttributes({ src: withImageWidth(src, finalWidth) });
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  /** 키보드 대체 경로(WCAG 2.2 드래그 대체) — 화살표로 40px 단위 조절, Delete로 원본 복귀. */
  const resizeByKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!editable) return;
    const base = width ?? imgRef.current?.getBoundingClientRect().width ?? 400;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = clampImageWidth(base + (event.key === "ArrowRight" ? 40 : -40));
      updateAttributes({ src: withImageWidth(src, next) });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      updateAttributes({ src: withImageWidth(src, null) });
    }
  };

  if (failed || resolved.error) {
    return (
      <NodeViewWrapper className="image-view image-view-broken" contentEditable={false}>
        <span>{alt ?? src}</span>
        <span className="image-view-broken-note">이미지를 불러올 수 없습니다</span>
      </NodeViewWrapper>
    );
  }

  if (resolved.loading || !resolved.resolvedSrc) {
    return (
      <NodeViewWrapper className="image-view image-view-loading" contentEditable={false}>
        <span role="status">이미지 불러오는 중…</span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="image-view" contentEditable={false}>
      <span className="image-view-frame" style={width ? { width: `${width}px` } : undefined}>
        <img
          ref={imgRef}
          src={resolved.resolvedSrc}
          alt={alt ?? ""}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
        {editable ? (
          <button
            type="button"
            className="image-view-resize"
            aria-label="이미지 크기 조절 (좌우 화살표로 조절, Delete로 원본 크기)"
            onPointerDown={startResize}
            onKeyDown={resizeByKeyboard}
          />
        ) : null}
      </span>
      {editable ? (
        <input
          className="image-view-caption"
          aria-label="이미지 캡션"
          placeholder="캡션 입력…"
          value={title ?? ""}
          onChange={(e) => updateAttributes({ title: e.target.value || null })}
        />
      ) : title ? (
        <span className="image-view-caption-text">{title}</span>
      ) : null}
    </NodeViewWrapper>
  );
}
