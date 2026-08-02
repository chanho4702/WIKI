import type { Blockquote, Paragraph, Root, Text } from "mdast";
import { visit } from "unist-util-visit";

/**
 * GitHub-style Alerts — `> [!NOTE]` 등 순수 blockquote 문법을 안내 패널로 렌더링하기 위한
 * remark 플러그인. 저장 문자열은 항상 순수 blockquote(GFM 표준 범위)로 남고, 이 문법을
 * 모르는 렌더러에서는 그냥 인용구로 안전하게 열화된다 — 우리 렌더러에서만 시각적으로
 * Confluence Info/Tip/Note/Warning 패널과 동등한 결과를 만든다.
 */

/**
 * 저장 마커 ↔ 화면 명칭 매핑 (기획 P7 확정, 레퍼런스 `기능들.png`).
 *
 * 저장은 GitHub Alerts 마커 그대로 두고 **표시 명칭만** 컨플루언스 패널 이름에 맞춘다 —
 * 저장 문자열을 바꾸면 기존 문서가 전부 깨지고, GFM 표준에서 벗어난다.
 *
 * | 마커 | 화면 | 색 | 근거 |
 * |---|---|---|---|
 * | NOTE | 정보 | 파랑 | 캡처의 파란 ℹ 패널 |
 * | TIP | 성공 | 초록 | 캡처의 초록 ✓ 패널 |
 * | IMPORTANT | 노트 | 보라 | 캡처의 보라 패널 |
 * | WARNING | 경고 | 노랑 | 캡처의 노란 ⚠ 패널 |
 * | CAUTION | 주의 | 빨강 | 캡처에 없으나 마커가 존재해 유지(GitHub CAUTION=위험) |
 */
export const ALERT_LABELS = {
  NOTE: "정보",
  TIP: "성공",
  IMPORTANT: "노트",
  WARNING: "경고",
  CAUTION: "주의",
} as const;

export type AlertType = keyof typeof ALERT_LABELS;

const LABELS = ALERT_LABELS;

/** 마커는 대문자 타입 + `]` + (선택) 공백 한 칸까지만 소비한다 — 개행(\n)은 소비하지 않아 다음 줄 콘텐츠를 보존한다 */
const MARKER_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\] ?/;

function isAlertBlockquote(
  node: Blockquote,
): { firstParagraph: Paragraph; firstText: Text; type: AlertType; rest: string } | null {
  const firstParagraph = node.children[0];
  if (!firstParagraph || firstParagraph.type !== "paragraph") return null;

  const firstText = firstParagraph.children[0];
  if (!firstText || firstText.type !== "text") return null;

  const match = MARKER_RE.exec(firstText.value);
  if (!match) return null;

  return {
    firstParagraph,
    firstText,
    type: match[1] as AlertType,
    rest: firstText.value.slice(match[0].length),
  };
}

export function remarkAlerts() {
  return (tree: Root) => {
    visit(tree, "blockquote", (node: Blockquote) => {
      const matched = isAlertBlockquote(node);
      if (!matched) return;
      const { firstParagraph, type, rest } = matched;

      // 마커 텍스트 제거 — 같은 줄 잔여 텍스트는 보존, 없으면 텍스트 노드 자체를 제거
      if (rest.length > 0) {
        firstParagraph.children[0] = { type: "text", value: rest };
      } else {
        firstParagraph.children.shift();
      }
      // 마커가 문단의 전부였다면(같은 줄 잔여 콘텐츠도 없음) 빈 문단은 통째로 제거
      if (firstParagraph.children.length === 0) {
        node.children.shift();
      }

      // 접근성을 위해 라벨을 CSS ::before가 아닌 실제 노드로 삽입 — 스크린 리더가 읽는다
      const labelNode: Paragraph = {
        type: "paragraph",
        data: { hName: "p", hProperties: { className: ["md-alert-label"] } },
        children: [{ type: "text", value: LABELS[type] }],
      };
      node.children.unshift(labelNode);

      node.data = {
        ...node.data,
        hName: "div",
        hProperties: { className: ["md-alert", `md-alert-${type.toLowerCase()}`] },
      };
    });
  };
}
