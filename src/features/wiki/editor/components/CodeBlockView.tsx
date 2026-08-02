import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Copy, WrapText, ListOrdered } from "lucide-react";
import { CodeLineNumbers } from "../../components/CodeLineNumbers";
import { showsLineNumbers, useCodeBlockPrefs } from "../../lib/codeBlockPrefs";
import { CODE_LANGUAGES } from "../../lib/codeLanguages";

/**
 * 코드 블록 NodeView — 언어 선택 · 줄 번호 · 줄바꿈 토글 · 복사.
 *
 * 툴바는 블록 **아래**에 둔다(기획 P4, 캡처 `기능들.png`). 예전엔 우상단에 절대 배치라
 * 코드 첫 줄을 가렸다.
 *
 * 줄 번호·줄바꿈은 문서가 아니라 보는 사람에게 붙는 설정이다(기획 P1) — 여기서 토글해도
 * `Page.body`는 바뀌지 않는다.
 */
export function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs.language as string | null) ?? "plaintext";
  // 기존 문서에 목록에 없는 언어값이 저장돼 있을 수 있다 — 옵션에 동적으로 추가해 값이 사라지지 않게 한다
  const options = CODE_LANGUAGES.includes(language) ? CODE_LANGUAGES : [language, ...CODE_LANGUAGES];
  const { prefs, toggle } = useCodeBlockPrefs();
  const numbered = showsLineNumbers(prefs);

  const copy = () => {
    void navigator.clipboard.writeText(node.textContent);
  };

  return (
    <NodeViewWrapper
      className={`code-block-view${numbered ? " code-block-view--numbered" : ""}${
        prefs.wrap ? " code-block-view--wrap" : ""
      }`}
    >
      <div className="code-block-body">
        {numbered && <CodeLineNumbers code={node.textContent} />}
        <pre>
          <NodeViewContent as="code" />
        </pre>
      </div>
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
        <button
          type="button"
          aria-label="줄바꿈"
          aria-pressed={prefs.wrap}
          title="줄바꿈"
          onClick={() => toggle("wrap")}
        >
          <WrapText size={16} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="줄 번호"
          aria-pressed={prefs.lineNumbers}
          title={prefs.wrap ? "줄바꿈이 켜져 있어 줄 번호가 표시되지 않습니다" : "줄 번호"}
          onClick={() => toggle("lineNumbers")}
        >
          <ListOrdered size={16} aria-hidden />
        </button>
        <button type="button" aria-label="코드 복사" title="코드 복사" onClick={copy}>
          <Copy size={16} aria-hidden />
        </button>
      </div>
    </NodeViewWrapper>
  );
}
