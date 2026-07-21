import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Copy } from "lucide-react";

/** 언어 셀렉트 기본 후보 목록 */
const LANGUAGES = [
  "plaintext",
  "ts",
  "js",
  "tsx",
  "jsx",
  "java",
  "kotlin",
  "python",
  "sql",
  "json",
  "yaml",
  "bash",
  "html",
  "css",
  "markdown",
];

/** 코드 블록 NodeView — 언어 선택 셀렉트 + 클립보드 복사 버튼을 붙인다 (스키마 무영향, 렌더링 전용) */
export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "plaintext";
  // 기존 문서에 목록에 없는 언어값이 저장돼 있을 수 있다 — 옵션에 동적으로 추가해 값이 사라지지 않게 한다
  const options = LANGUAGES.includes(language) ? LANGUAGES : [language, ...LANGUAGES];

  const copy = () => {
    void navigator.clipboard.writeText(node.textContent);
  };

  return (
    <NodeViewWrapper className="code-block-view">
      <div className="code-block-toolbar" contentEditable={false}>
        <select
          aria-label="코드 언어"
          value={language}
          onChange={(e) =>
            updateAttributes({ language: e.target.value === "plaintext" ? null : e.target.value })
          }
        >
          {options.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button type="button" aria-label="코드 복사" title="코드 복사" onClick={copy}>
          <Copy size={16} aria-hidden />
        </button>
      </div>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
