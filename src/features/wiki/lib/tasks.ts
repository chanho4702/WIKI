/**
 * 액션 아이템 파서(W23) — 백엔드 TaskService.parse와 같은 규칙. 목업 모드가 쓰고,
 * 두 모드에서 "무엇이 작업인가"가 갈리지 않게 한 곳에 둔다.
 *
 * 담당자는 항목 안의 멘션(`[@이름](user:id)`), 기한은 날짜 요소(`[…](date:YYYY-MM-DD)`)다.
 */
const TASK_LINE = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*\S)\s*$/;
const MENTION = /\[@[^\]]*\]\(user:([\w-]+)\)/;
const DATE = /\[[^\]]*\]\(date:(\d{4}-\d{2}-\d{2})\)/;
const MENTION_TO_TEXT = /\[(@[^\]]*)\]\(user:[\w-]+\)/g;
const DATE_TO_TEXT = /\[([^\]]*)\]\(date:\d{4}-\d{2}-\d{2}\)/g;

export interface ParsedTask {
  /** 본문 줄 번호(1부터) — 토글이 이 줄을 다시 쓴다. */
  lineNo: number;
  text: string;
  assigneeId: string | null;
  dueDate: string | null;
  done: boolean;
}

export function parseTasks(body: string): ParsedTask[] {
  const out: ParsedTask[] = [];
  body.split("\n").forEach((line, i) => {
    const m = TASK_LINE.exec(line);
    if (!m) return;
    const raw = m[2];
    out.push({
      lineNo: i + 1,
      text: raw.replace(MENTION_TO_TEXT, "$1").replace(DATE_TO_TEXT, "$1").trim(),
      assigneeId: MENTION.exec(raw)?.[1] ?? null,
      dueDate: DATE.exec(raw)?.[1] ?? null,
      done: m[1] !== " ",
    });
  });
  return out;
}

/** 그 줄의 체크 상태를 바꾼 본문. 작업 항목이 아니면 null — 엉뚱한 줄을 건드리지 않는다. */
export function toggleTaskLine(body: string, lineNo: number, done: boolean): string | null {
  const lines = body.split("\n");
  const line = lines[lineNo - 1];
  if (line === undefined || !TASK_LINE.test(line)) return null;
  lines[lineNo - 1] = line.replace(/\[( |x|X)\]/, done ? "[x]" : "[ ]");
  return lines.join("\n");
}
