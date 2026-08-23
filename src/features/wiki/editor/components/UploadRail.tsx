import { RotateCcw, X } from "lucide-react";

export type ImageUploadTaskStatus = "uploading" | "placing" | "failed" | "cancelled";

export interface ImageUploadTaskView {
  id: string;
  filename: string;
  progress: number;
  status: ImageUploadTaskStatus;
  error?: string;
}

interface UploadRailProps {
  tasks: ImageUploadTaskView[];
  onCancel: (taskId: string) => void;
  onRetry: (taskId: string) => void;
  onDismiss: (taskId: string) => void;
}

function statusText(task: ImageUploadTaskView): string {
  if (task.status === "uploading") return `업로드 중 · ${task.progress}%`;
  if (task.status === "placing") return "문서에 넣는 중";
  if (task.status === "cancelled") return "업로드 취소됨";
  return task.error ?? "업로드 실패";
}

/** 툴바 아래의 조용한 전송 레일. 실패 항목은 사라지지 않아 같은 파일을 즉시 복구할 수 있다. */
export function UploadRail({ tasks, onCancel, onRetry, onDismiss }: UploadRailProps) {
  if (!tasks.length) return null;

  return (
    <section className="wiki-upload-rail" aria-label="이미지 업로드" aria-live="polite">
      <ul>
        {tasks.map((task) => {
          const recoverable = task.status === "failed" || task.status === "cancelled";
          return (
            <li key={task.id} className={`wiki-upload-task wiki-upload-task--${task.status}`}>
              <div className="wiki-upload-task-copy">
                <span className="wiki-upload-task-name" title={task.filename}>{task.filename}</span>
                <span
                  className="wiki-upload-task-state"
                  role={task.status === "failed" ? "alert" : undefined}
                >
                  {statusText(task)}
                </span>
              </div>
              <progress
                className="wiki-upload-progress"
                max={100}
                value={task.status === "placing" ? 100 : task.progress}
                aria-label={`${task.filename} 업로드 진행률`}
              />
              <div className="wiki-upload-task-actions">
                {task.status === "uploading" ? (
                  <button type="button" onClick={() => onCancel(task.id)} aria-label={`${task.filename} 업로드 취소`}>
                    취소
                  </button>
                ) : null}
                {recoverable ? (
                  <>
                    <button type="button" onClick={() => onRetry(task.id)} aria-label={`${task.filename} 다시 업로드`}>
                      <RotateCcw size={14} aria-hidden />
                      재시도
                    </button>
                    <button
                      type="button"
                      className="wiki-upload-task-dismiss"
                      onClick={() => onDismiss(task.id)}
                      aria-label={`${task.filename} 업로드 항목 닫기`}
                      title="닫기"
                    >
                      <X size={15} aria-hidden />
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
