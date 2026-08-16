import { Button } from "@chanho/react";
import type { Page } from "../store/types";

interface EditConflictPanelProps {
  serverPage: Page | null;
  localTitle: string;
  localBody: string;
  comparisonOpen: boolean;
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
  onToggleComparison,
  onCopyLocal,
  onCopyServer,
  onReloadServer,
  onContinueMerge,
}: EditConflictPanelProps) {
  return (
    <section className="edit-conflict" role="alert" aria-labelledby="edit-conflict-title">
      <div className="edit-conflict-summary">
        <div>
          <h2 id="edit-conflict-title">다른 사용자의 변경사항이 먼저 저장됐습니다</h2>
          <p>내 편집은 사라지지 않았습니다. 서버본을 비교한 뒤 복구 방법을 선택하세요.</p>
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
            <Button size="small" variant="subtle" onClick={onReloadServer}>
              서버본으로 다시 불러오기
            </Button>
          </>
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
              <h3 id="edit-conflict-local-heading">내가 저장하려던 내용</h3>
            </div>
            <strong>{localTitle}</strong>
            <pre>{localBody || "(빈 본문)"}</pre>
          </section>
          <div className="edit-conflict-merge">
            <p>위 서버 변경을 현재 에디터에 반영한 뒤 저장하려면 병합 기준을 최신 버전으로 바꾸세요.</p>
            <Button size="small" onClick={onContinueMerge}>
              서버 v{serverPage.version} 기준으로 병합 계속
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
