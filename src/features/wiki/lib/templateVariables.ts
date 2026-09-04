/**
 * 템플릿 변수(W27-1) — `{{date}}`·`{{author}}`·`{{space}}`.
 *
 * 치환은 **프론트에서, 문서를 만들 때 한 번만** 한다. 서버는 본문을 그대로 저장하니 목업·백엔드
 * 어느 모드에서도 결과가 같고, 만들어진 뒤 문서 안에 남은 `{{…}}`는 그냥 글자다(다시 치환되지
 * 않는다 — 그러면 작성자가 일부러 쓴 중괄호가 나중에 사라진다).
 *
 * 제목(`{{title}}`)은 넣지 않는다: 만드는 시점의 제목은 언제나 "제목 없음"이라 넣을 값이 없다.
 * 모르는 변수는 지우지 않고 그대로 둔다 — 오타를 조용히 삼키면 작성자가 알아챌 방법이 없다.
 */
export interface TemplateVariables {
  /** 오늘 날짜(YYYY-MM-DD) */
  date: string;
  /** 만든 사람 이름. 조회 실패 시 빈 문자열 */
  author: string;
  /** 스페이스 이름. 조회 실패 시 빈 문자열 */
  space: string;
}

/** `{{ date }}`처럼 공백이 섞인 형태도 받는다 — 손으로 쓰는 문법이라 공백이 흔하다. */
const VARIABLE_RE = /\{\{\s*(date|author|space)\s*\}\}/g;

export function applyTemplateVariables(content: string, variables: TemplateVariables): string {
  return content.replace(VARIABLE_RE, (_, name: string) => variables[name as keyof TemplateVariables] ?? "");
}

/**
 * 오늘 날짜(YYYY-MM-DD). `toISOString()`은 UTC라 한국 시간 아침 9시 이전에 어제가 된다 —
 * 로컬 달력 기준으로 직접 만든다.
 */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
