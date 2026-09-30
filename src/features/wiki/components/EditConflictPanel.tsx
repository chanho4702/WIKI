import { Button } from "@chanho/react";
import type { Page } from "../store/types";

/**
 * - `save`: 저장(409)이 다른 사용자의 저장과 충돌했다.
 * - `collaboration-reset`: 공동 초안이 다른 경로의 저장으로 새로 시작됐다. 이 탭의 Y.Doc은 새 초안에
 *   합칠 수 없으므로 "병합 계속" 대신 최신 버전 기준으로 공동 편집을 다시 시작하는 한 갈래만 둔다.
 */
export type EditConflictVariant = "save" | "collaboration-reset";

interface EditConflictPanelProps {
  serverPage: Page | null;
  localTitle: string;
  localBody: string;
  comparisonOpen: boolean;
  variant?: EditConflictVariant;
  onToggleComparison: () => void;
  onCopyLocal: () => void;
  onCopyServer: () => void;
  onReloadServer: () => void;
  onContinueMerge: () => void;
}

/**
 * 저장 충돌은 에디터를 덮거나 모달로 가리지 않는다. 로컬 작업을 그대로 둔 채 최신 서버본을
 * 나란히 열고, 사용자가 복사·재로드·수동 병합 중 복구 방식을 명시적으로 고르게 한다.
 */
export function EditConflictPanel({
  serverPage,
  localTitle,
  localBody,
  comparisonOpen,
  variant = "save",
  onToggleComparison,
  onCopyLocal,
  onCopyServer,
  onReloadServer,
  onContinueMerge,
}: EditConflictPanelProps) {
  const reset = variant === "collaboration-reset";
  const restartLabel = serverPage
    ? `서버 v${serverPage.version} 기준으로 공동 편집 다시 시작`
    : "최신 버전 기준으로 공동 편집 다시 시작";
  return (
    <section className="edit-conflict" role="alert" aria-labelledby="edit-conflict-title">
      <div className="edit-conflict-summary">
        <div>
          <h2 id="edit-conflict-title">
            {reset
              ? "공동 초안이 다른 경로의 저장으로 새로 시작되었습니다"
              : "다른 사용자의 변경사항이 먼저 저장됐습니다"}
          </h2>
          <p>
            {reset
              ? "내 편집은 사라지지 않았습니다. 새 공동 문서에는 자동으로 합쳐지지 않으니, 서버 최신본과 비교해 필요한 부분을 복사한 뒤 다시 시작하세요."
              : "내 편집은 사라지지 않았습니다. 서버본을 비교한 뒤 복구 방법을 선택하세요."}
          </p>
        </div>
        {serverPage ? <span className="edit-conflict-version">서버 v{serverPage.version}</span> : null}
      </div>

      <div className="edit-conflict-actions">
        <Button size="small" variant="subtle" onClick={onCopyLocal}>
          내 변경 복사
        </Button>
        {serverPage ? (
          <>
            <Button size="small" variant="subtle" onClick={onToggleComparison}>
              {comparisonOpen ? "비교 닫기" : "서버본 비교"}
            </Button>
            {reset ? null : (
              <Button size="small" variant="subtle" onClick={onReloadServer}>
                서버본으로 다시 불러오기
              </Button>
            )}
          </>
        ) : null}
        {reset && !(comparisonOpen && serverPage) ? (
          <Button size="small" onClick={onContinueMerge}>
            {restartLabel}
          </Button>
        ) : null}
      </div>

      {comparisonOpen && serverPage ? (
        <div className="edit-conflict-compare" aria-label="저장 충돌 내용 비교">
          <section aria-labelledby="edit-conflict-server-heading">
            <div className="edit-conflict-pane-heading">
              <h3 id="edit-conflict-server-heading">서버에 저장된 내용</h3>
              <Button size="small" variant="subtle" onClick={onCopyServer}>
                서버본 복사
              </Button>
            </div>
            <strong>{serverPage.title}</strong>
            <pre>{serverPage.body || "(빈 본문)"}</pre>
          </section>
          <section aria-labelledby="edit-conflict-local-heading">
            <div className="edit-conflict-pane-heading">
              <h3 id="edit-conflict-local-heading">
                {reset ? "이 탭의 편집 내용" : "내가 저장하려던 내용"}
              </h3>
            </div>
            <strong>{localTitle}</strong>
            <pre>{localBody || "(빈 본문)"}</pre>
          </section>
          <div className="edit-conflict-merge">
            <p>
              {reset
                ? "다시 시작하면 편집기가 서버 최신본으로 열립니다. 옮길 내용은 먼저 복사해 두세요."
                : "위 서버 변경을 현재 에디터에 반영한 뒤 저장하려면 병합 기준을 최신 버전으로 바꾸세요."}
            </p>
            <Button size="small" onClick={onContinueMerge}>
              {reset ? restartLabel : `서버 v${serverPage.version} 기준으로 병합 계속`}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
