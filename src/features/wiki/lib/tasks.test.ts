import { describe, expect, it } from "vitest";
import { parseTasks, toggleTaskLine } from "./tasks";

describe("액션 아이템 파서", () => {
  it("멘션이 담당자, 날짜가 기한이다", () => {
    const [t] = parseTasks("# 제목\n\n- [ ] 배포 공지 [@나](user:u1) [2026-09-01](date:2026-09-01)");
    expect(t).toEqual({ lineNo: 3, text: "배포 공지 @나 2026-09-01", assigneeId: "u1", dueDate: "2026-09-01", done: false });
  });

  it("체크된 항목과 담당자 없는 항목도 읽는다", () => {
    const tasks = parseTasks("- [x] 끝난 일\n- [ ] 주인 없음");
    expect(tasks.map((t) => [t.done, t.assigneeId])).toEqual([[true, null], [false, null]]);
  });

  it("작업 항목이 아닌 줄은 토글하지 않는다", () => {
    expect(toggleTaskLine("그냥 문단", 1, true)).toBeNull();
    expect(toggleTaskLine("- [ ] 일", 1, true)).toBe("- [x] 일");
    expect(toggleTaskLine("- [x] 일", 1, false)).toBe("- [ ] 일");
  });
});
