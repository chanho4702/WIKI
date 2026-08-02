import { countLines } from "../lib/codeBlockPrefs";

/**
 * 코드 블록 줄 번호 거터.
 *
 * **`<pre>` 바깥**에 그린다. 보기 화면의 복사 버튼은 `pre.textContent`를 읽고, 사용자가 코드를
 * 드래그해 복사할 때도 `<pre>` 안의 텍스트가 통째로 잡힌다 — 번호를 안에 넣으면 붙여넣기가
 * "1const x = 1\n2const y = 2"가 된다. 편집·보기 두 경로가 이 컴포넌트를 공유해 규칙이 갈리지
 * 않게 한다.
 *
 * `aria-hidden`인 이유: 스크린리더가 코드 앞에 숫자를 읽으면 코드가 아닌 것이 코드처럼 읽힌다.
 * 번호는 시각적 참조용이다.
 */
export function CodeLineNumbers({ code }: { code: string }) {
  const lines = countLines(code);
  return (
    <div className="code-line-numbers" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i}>{i + 1}</span>
      ))}
    </div>
  );
}
