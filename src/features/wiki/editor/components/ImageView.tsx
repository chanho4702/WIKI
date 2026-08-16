import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useResolvedWikiImage } from "../../lib/useResolvedWikiImage";

/** 이미지 NodeView — 로드 실패 시 placeholder 박스를 표시한다 */
export function ImageView({ node }: NodeViewProps) {
  const [failed, setFailed] = useState(false);
  const { src, alt } = node.attrs as { src: string; alt: string | null };
  const resolved = useResolvedWikiImage(src);

  // src 변경 시 failed 상태를 리셋한다 — ReactNodeViewRenderer는 인스턴스를 재사용하므로 필요
  useEffect(() => {
    setFailed(false);
  }, [src]);

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
      <img
        src={resolved.resolvedSrc}
        alt={alt ?? ""}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </NodeViewWrapper>
  );
}
