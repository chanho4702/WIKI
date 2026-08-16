import { useEffect, useState } from "react";
import { attachmentIdFromInlineUrl, fetchInlineAttachment } from "../store/wikiStore";

export interface ResolvedWikiImage {
  resolvedSrc: string | null;
  loading: boolean;
  error: boolean;
}

/** 내부 첨부는 인증 fetch→Blob URL, 외부 URL은 기존 src 그대로 사용한다. */
export function useResolvedWikiImage(src: string): ResolvedWikiImage {
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
