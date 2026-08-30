import type { Root } from "mdast";
import { visit } from "unist-util-visit";

/**
 * 상태 배지·페이지 속성(W23) — 컨플루언스의 Status / Page Properties 매크로.
 *
 * - `:status[진행 중]{.info}` 텍스트 지시자 → 배지(`span.md-status`). 색은 DS Lozenge의
 *   appearance 이름(neutral·info·success·warning·danger)만 받는다 — 지라식 상태 의미와 같다.
 *   모르는 이름은 neutral로 그린다: 내용이 사라지는 게 최악의 실패다(글자색 지시자와 같은 원칙).
 * - `:::properties` … `:::` 컨테이너 → `div.md-properties`. 안에 2열 표를 두면 문서 머리의
 *   속성 표가 된다. 문법을 새로 들이지 않고 표를 그대로 쓴다 — 컨플루언스도 그렇다.
 *
 * remarkColumns보다 먼저 실행돼야 한다(모르는 containerDirective를 div로 덮어쓰는 폴백).
 */
export const STATUS_APPEARANCES = ["neutral", "info", "success", "warning", "danger"] as const;
export type StatusAppearance = (typeof STATUS_APPEARANCES)[number];

export function statusAppearance(raw: string | null | undefined): StatusAppearance {
  const value = (raw ?? "").trim();
  return (STATUS_APPEARANCES as readonly string[]).includes(value) ? (value as StatusAppearance) : "neutral";
}

export function remarkStatus() {
  return (tree: Root) => {
    visit(tree, (node) => {
      const directive = node as typeof node & {
        name?: string;
        attributes?: Record<string, string | null | undefined>;
        data?: { hName?: string; hProperties?: Record<string, unknown> };
      };
      if (node.type === "textDirective" && directive.name === "status") {
        const data = (directive.data ??= {});
        data.hName = "span";
        data.hProperties = {
          className: ["md-status"],
          "data-appearance": statusAppearance(directive.attributes?.class),
        };
        return;
      }
      if (node.type === "containerDirective" && directive.name === "properties") {
        const data = (directive.data ??= {});
        data.hName = "div";
        data.hProperties = { className: ["md-properties"] };
        return;
      }
      // 속성 보고서(`::properties-report[라벨]`) — 리프 지시자의 라벨은 자식 인라인으로 온다(발췌 포함과 같다)
      if (node.type === "leafDirective" && directive.name === "properties-report") {
        const children = ((node as { children?: Array<{ type: string; value?: string }> }).children ?? []);
        const label = children.map((c) => (c.type === "text" ? (c.value ?? "") : "")).join("").trim();
        const data = (directive.data ??= {});
        data.hName = "div";
        data.hProperties = { className: ["md-properties-report"], "data-label": label };
        (node as { children?: unknown[] }).children = [];
      }
    });
  };
}
