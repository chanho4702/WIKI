import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 토글 보기 렌더 — `:::details[제목]` 컨테이너 지시자를 네이티브 `<details>/<summary>`로 바꾼다.
 *
 * 네이티브 요소를 쓰는 이유: 접기/펼치기·키보드 조작(Enter/Space)·스크린리더 지원을
 * 브라우저가 공짜로 준다(JS 없이). 보기 화면 기본은 접힘 — Confluence expand와 동일하며,
 * `<details>`의 기본값이기도 하다.
 *
 * remark-directive의 라벨(`[제목]`)은 `data.directiveLabel`이 붙은 첫 문단으로 들어온다 —
 * 그 문단을 `<summary>`로 바꾸고, 라벨이 없으면 기본 제목을 넣는다.
 * (기본 제목 "펼쳐서 보기"는 레퍼런스 없음 — Confluence 한국어 기본 문구 확인 후 정정 여지)
 *
 * 이 플러그인은 remarkColumns보다 **먼저** 실행돼야 한다 — remarkColumns는 모든
 * containerDirective의 hName을 div로 덮어쓰는 폴백을 갖고 있어, details를 남겨두면
 * (skip 처리돼 있긴 하지만) 순서까지 맞춰 이중 방어한다.
 */
export const DEFAULT_DETAILS_SUMMARY = "펼쳐서 보기";

export function remarkDetails() {
  return (tree: Root) => {
    visit(tree, (node) => {
      if (node.type !== "containerDirective") return;
      const directive = node as typeof node & {
        name: string;
        children: Array<{ type: string; data?: Record<string, unknown>; children?: unknown[] }>;
        data?: { hName?: string; hProperties?: Record<string, unknown> };
      };
      if (directive.name !== "details") return;

      const data = (directive.data ??= {});
      data.hName = "details";
      data.hProperties = { className: ["md-details"] };

      const label = directive.children.find(
        (child) => (child.data as { directiveLabel?: boolean } | undefined)?.directiveLabel,
      );
      if (label) {
        const labelData = (label.data ??= {});
        labelData.hName = "summary";
        labelData.hProperties = { className: ["md-details-summary"] };
        return;
      }
      // 라벨 없는 토글 — 제목 없이 화살표만 남으면 눌러야 할 곳이 안 보인다(휴리스틱 #6)
      directive.children.unshift({
        type: "paragraph",
        data: { hName: "summary", hProperties: { className: ["md-details-summary"] } },
        children: [{ type: "text", value: DEFAULT_DETAILS_SUMMARY } as unknown as never],
      });
    });
  };
}
