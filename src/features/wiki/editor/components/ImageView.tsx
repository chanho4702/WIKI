import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

/** 이미지 NodeView — 로드 실패 시 placeholder 박스를 표시한다 */
export function ImageView({ node }: NodeViewProps) {
  const [failed, setFailed] = useState(false);
  const { src, alt } = node.attrs as { src: string; alt: string | null };

  if (failed) {
    return (
      <NodeViewWrapper className="image-view image-view-broken" contentEditable={false}>
        <span>{alt ?? src}</span>
        <span className="image-view-broken-note">이미지를 불러올 수 없습니다</span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="image-view" contentEditable={false}>
      <img src={src} alt={alt ?? ""} onError={() => setFailed(true)} />
    </NodeViewWrapper>
  );
}
