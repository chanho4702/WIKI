import { useEffect, useState } from "react";
import { attachmentIdFromInlineUrl, fetchInlineAttachment } from "../store/wikiStore";
import { stripImageWidth } from "./imageAttrs";

export interface ResolvedWikiImage {
  resolvedSrc: string | null;
  loading: boolean;
  error: boolean;
}

/** 내부 첨부는 인증 fetch→Blob URL, 외부 URL은 기존 src 그대로 사용한다. */
export function useResolvedWikiImage(rawSrc: string): ResolvedWikiImage {
  // `#w=` 표시 폭 프래그먼트는 로드 경로가 아니다 — 첨부 ID 정확일치 파서에 걸리기 전에 걷어낸다
  const src = stripImageWidth(rawSrc);
  const attachmentId = attachmentIdFromInlineUrl(src);
  const [state, setState] = useState<ResolvedWikiImage>(() => ({
    resolvedSrc: attachmentId ? null : src,
    loading: attachmentId !== null,
    error: false,
  }));

  useEffect(() => {
    const id = attachmentIdFromInlineUrl(src);
    if (!id) {
      setState({ resolvedSrc: src, loading: false, error: false });
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setState({ resolvedSrc: null, loading: true, error: false });
    void fetchInlineAttachment(id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ resolvedSrc: objectUrl, loading: false, error: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        setState({ resolvedSrc: null, loading: false, error: true });
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return state;
}
