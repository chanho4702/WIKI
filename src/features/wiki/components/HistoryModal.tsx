import { useEffect, useState } from "react";
import { Button, Modal, Tabs, useToast } from "@chanho/react";
import { SkeletonLines } from "./WikiSkeleton";
import { History } from "lucide-react";
import type { Page, PageVersion, User } from "../store/types";
import { getVersion, listVersions, restoreVersion } from "../store/wikiStore";
import { displayUserName } from "../lib/userName";
import { DiffView } from "./DiffView";
import { MarkdownView } from "./MarkdownView";

export interface HistoryModalProps {
  /** 현재 보고 있는 페이지 — no-op 판정(updatedAt 비교) 기준 */
  page: Page;
  /** 저장자 이름 표시용 — PageViewPage가 이미 로드한 목록 재사용 */
  users: User[];
  /** 복원 후 반환 Page 전달 — 부모가 setPage + reloadPages 수행 */
  onRestored: (page: Page) => void | Promise<void>;
}

/** 저장 시각 표기: ko-KR 날짜+시간 (예: "2026. 7. 10. 오후 7:00:00"). 빈 값/무효는 "". */
function formatDateTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
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
  /**
   * 비교 기준 버전(W22). null이면 직전 버전과 비교한다 — 예전에는 그것만 가능했다.
   * 버전이 수십 개가 되면 "3주 전 그 상태와 지금"을 봐야 하는데, 직전 비교로는 그걸 못 본다.
   */
  const [compareId, setCompareId] = useState<string | null>(null);
  /**
   * 본문 캐시 — 목록은 메타만 주므로 미리보기·비교에 필요한 버전만 그때 읽는다.
   * 이력이 수십 개인 문서의 본문을 목록 한 번에 전부 싣지 않기 위한 계약이다.
   */
  const [bodies, setBodies] = useState<Record<string, PageVersion>>({});
  const toast = useToast();

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setVersions(null);
      setCompareId(null);
      setBodies({});
      void listVersions(page.id).then((list) => {
        setVersions(list); // 스토어가 version 내림차순(최신 먼저) 보장
        setSelectedId(list[0]?.id ?? null); // 최신 버전 기본 선택
      });
    }
  };

  const selectedMeta = versions?.find((v) => v.id === selectedId) ?? null;
  const baseMeta =
    versions?.find((v) => v.id === compareId)
    ?? (selectedMeta
      ? versions?.find((v) => v.version === selectedMeta.version - 1) ?? null
      : null);

  // 화면에 필요한 두 버전의 본문만 읽어 캐시한다(이미 읽은 것은 다시 읽지 않는다).
  useEffect(() => {
    const wanted = [selectedMeta?.id, baseMeta?.id].filter(
      (id): id is string => typeof id === "string" && !(id in bodies),
    );
    if (wanted.length === 0) return;
    let cancelled = false;
    void Promise.all(wanted.map((id) => getVersion(page.id, id).catch(() => null))).then((loaded) => {
      if (cancelled) return;
      const next: Record<string, PageVersion> = {};
      loaded.forEach((v, i) => {
        if (v) next[wanted[i]] = v;
      });
      if (Object.keys(next).length > 0) setBodies((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
  }, [selectedMeta?.id, baseMeta?.id, bodies, page.id]);

  const selected = selectedMeta ? bodies[selectedMeta.id] ?? selectedMeta : null;
  // 디렉터리(ACTIVE만)에서 못 찾으면 저장 시점 스냅샷 이름(W23), 그것도 없으면 `사용자 #{id}`.
  // 퇴사한 사람이 고친 버전도 이름으로 읽혀야 한다.
  const userName = (id: string, snapshot?: string | null) =>
    users.find((u) => u.id === id)?.name ?? snapshot ?? (id ? displayUserName(id) : "알 수 없음");

  const handleRestore = async () => {
    if (!selected) return;
    try {
      const restored = await restoreVersion(page.id, selected.id);
      // no-op 판정(목업): 반환 Page의 updatedAt이 복원 전과 같으면 버전을 안 쌓았다.
      // 백엔드 모드는 updatedAt이 빈 문자열이라(설계 §9) 이 판정을 건너뛰어야 오작동 안 함 —
      // 백엔드 restore는 항상 새 버전을 만드므로 "복원했습니다"가 맞다.
      if (page.updatedAt !== "" && restored.updatedAt === page.updatedAt) {
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
        <Button variant="subtle" size="small" iconOnly aria-label="히스토리" title="히스토리">
          <History size={16} aria-hidden="true" />
        </Button>
      }
      title="버전 히스토리"
      open={open}
      onOpenChange={handleOpenChange}
      className="history-modal"
    >
      {versions === null ? (
        <SkeletonLines label="버전 로딩 중" widths={["70%", "65%", "72%", "60%"]} />
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
                    {userName(version.savedBy, version.savedByName)} · {formatDateTime(version.savedAt)}
                  </span>
                  {/* 변경 요약은 선택 입력이라 대개 없다 — 있을 때만 그린다 */}
                  {version.changeNote ? (
                    <span className="history-item-note">{version.changeNote}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="history-preview">
              <h2>{selected.title}</h2>
              {(() => {
                // 기준 버전 — 고르지 않았으면 직전 버전(v1이면 없음 = 전체 added)
                const base = baseMeta ? bodies[baseMeta.id] ?? baseMeta : null;
                return (
                  <Tabs
                    label="버전 미리보기"
                    items={[
                      {
                        value: "content",
                        label: "내용",
                        content: <MarkdownView markdown={selected.body} />,
                      },
                      {
                        value: "diff",
                        label: "변경사항",
                        content: (
                          <>
                            <div className="history-compare">
                              <label htmlFor="history-compare-base">비교 기준</label>
                              <select
                                id="history-compare-base"
                                value={compareId ?? ""}
                                onChange={(e) => setCompareId(e.target.value || null)}
                              >
                                <option value="">직전 버전</option>
                                {versions
                                  ?.filter((v) => v.id !== selected.id)
                                  .map((v) => (
                                    <option key={v.id} value={v.id}>
                                      v{v.version} · {formatDateTime(v.savedAt)}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            {base && base.title !== selected.title ? (
                              <p className="diff-title-change">
                                제목: {base.title} → {selected.title}
                              </p>
                            ) : null}
                            <DiffView oldText={base?.body ?? ""} newText={selected.body} />
                          </>
                        ),
                      },
                    ]}
                  />
                );
              })()}
              <Button onClick={handleRestore}>이 버전으로 복원</Button>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
