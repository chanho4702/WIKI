import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { EmptyState, PageHeader } from "@chanho/react";
import type { MyTask } from "../store/types";
import { listMyTasks, setTaskDone } from "../store/wikiStore";
import { useToast } from "@chanho/react";

/**
 * 내 작업(`/tasks`, W23) — 담당자가 나인 체크박스 항목을 문서를 가로질러 모은다.
 *
 * 체크박스 목록은 있었지만 "누가 언제까지"가 없어서 회의록의 할 일이 회의록 안에서만 살았다.
 * 여기서 체크하면 **그 문서의 본문이 바뀐다**(리비전이 남는다) — 목록과 문서가 따로 놀지 않는다.
 */
export function TasksPage() {
  const toast = useToast();
  const [open, setOpen] = useState<MyTask[] | null>(null);
  const [done, setDone] = useState<MyTask[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([listMyTasks(false), listMyTasks(true)]);
      setOpen(o);
      setDone(d);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
      setOpen([]);
      setDone([]);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = async (task: MyTask, next: boolean) => {
    const key = `${task.pageId}:${task.lineNo}`;
    setBusy(key);
    try {
      await setTaskDone(task.pageId, task.lineNo, next);
      await reload();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  const renderList = (items: MyTask[], label: string) => (
    <ul className="task-list" aria-label={label}>
      {items.map((task) => {
        const key = `${task.pageId}:${task.lineNo}`;
        const overdue = !task.done && task.dueDate !== null && task.dueDate < today;
        return (
          <li key={key} className={task.done ? "task-item is-done" : "task-item"}>
            <input
              type="checkbox"
              checked={task.done}
              disabled={busy === key}
              aria-label={task.text}
              onChange={(e) => void toggle(task, e.target.checked)}
            />
            <span className="task-text">{task.text}</span>
            {task.dueDate ? (
              <span className={overdue ? "task-due is-overdue" : "task-due"}>{task.dueDate}</span>
            ) : null}
            <Link className="task-source" to={`/spaces/${task.spaceId}/pages/${task.pageId}`}>
              {task.spaceName ? `${task.spaceName} / ` : ""}
              {task.pageTitle}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="tasks-page" aria-labelledby="tasks-page-title">
      <div id="tasks-page-title">
        <PageHeader title="내 작업" />
      </div>
      <p className="tasks-page-desc">
        문서의 체크박스 항목 중 나를 멘션한 것입니다. 여기서 체크하면 그 문서가 함께 바뀝니다.
      </p>

      {open === null ? (
        <span role="status">작업 불러오는 중</span>
      ) : open.length === 0 ? (
        <EmptyState
          title="남은 작업이 없습니다"
          description="체크박스 항목에 @이름을 넣으면 그 사람의 작업이 됩니다. 날짜를 붙이면 기한이 됩니다."
        />
      ) : (
        renderList(open, "남은 작업")
      )}

      {done && done.length > 0 ? (
        <div className="tasks-done">
          <button type="button" className="tasks-done-toggle" onClick={() => setShowDone((v) => !v)}>
            완료한 작업 {done.length}개 {showDone ? "숨기기" : "보기"}
          </button>
          {showDone ? renderList(done, "완료한 작업") : null}
        </div>
      ) : null}
    </section>
  );
}
