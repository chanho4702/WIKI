import { useState } from "react";
import { Button, Modal, Spinner, useToast } from "@chanho/react";
import type { Page, PageVersion, User } from "../store/types";
import { listVersions, restoreVersion } from "../store/wikiStore";
import { MarkdownView } from "./MarkdownView";

export interface HistoryModalProps {
  /** 현재 보고 있는 페이지 — no-op 판정(updatedAt 비교) 기준 */
  page: Page;
  /** 저장자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
  /** 복원 후 반환 Page 전달 — 부모가 setPage + reloadPages 수행 */
  onRestored: (page: Page) => void | Promise<void>;
}

/** 저장 시각 표기: ko-KR 날짜+시간 (예: "2026. 7. 10. 오후 7:00:00") */
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR");
}

/**
 * 버전 히스토리 모달 — 좌측 버전 목록(최신순, 선택 하이라이트) + 우측 선택 버전 미리보기 + 복원.
 * 트리거는 우상단 "히스토리" Button (Modal trigger prop — URL 쿼리 아님).
 */
export function HistoryModal({ page, users, onRestored }: HistoryModalProps) {
  const [open, setOpen] = useState(false);
  // null = 로딩 중 — 모달이 열릴 때마다 재조회한다
  const [versions, setVersions] = useState<PageVersion[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const toast = useToast();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setVersions(null);
      void listVersions(page.id).then((list) => {
        setVersions(list); // 스토어가 version 내림차순(최신 먼저) 보장
        setSelectedId(list[0]?.id ?? null); // 최신 버전 기본 선택
      });
    }
  };

  const selected = versions?.find((v) => v.id === selectedId) ?? null;
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "알 수 없음";

  const handleRestore = async () => {
    if (!selected) return;
    try {
      const restored = await restoreVersion(page.id, selected.id);
      // no-op 판정: 반환 Page의 updatedAt이 복원 전과 같으면 스토어가 버전을 쌓지 않았다
      if (restored.updatedAt === page.updatedAt) {
        toast({ title: "현재 내용과 동일합니다 — 변경 없음", appearance: "info" });
      } else {
        toast({ title: `v${selected.version} 버전으로 복원했습니다`, appearance: "success" });
      }
      await onRestored(restored); // no-op이어도 무해 — 반환 Page가 현재와 동일
      setOpen(false);
    } catch (error) {
      toast({
        title: "복원 실패",
        description: error instanceof Error ? error.message : String(error),
        appearance: "danger",
      });
    }
  };

  return (
    <Modal
      trigger={
        <Button variant="subtle" size="small">
          히스토리
        </Button>
      }
      title="버전 히스토리"
      open={open}
      onOpenChange={handleOpenChange}
      className="history-modal"
    >
      {versions === null ? (
        <Spinner label="버전 로딩 중" />
      ) : (
        <div className="history-body">
          <ul className="history-list">
            {versions.map((version) => (
              <li key={version.id}>
                <button
                  type="button"
                  className="history-item"
                  aria-pressed={version.id === selectedId}
                  onClick={() => setSelectedId(version.id)}
                >
                  <strong>v{version.version}</strong>
                  <span className="history-item-meta">
                    {userName(version.savedBy)} · {formatDateTime(version.savedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="history-preview">
              <h2>{selected.title}</h2>
              <MarkdownView markdown={selected.body} />
              <Button onClick={handleRestore}>이 버전으로 복원</Button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
