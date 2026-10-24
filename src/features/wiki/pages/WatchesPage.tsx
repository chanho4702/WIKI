import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Banner, Button, Checkbox, EmptyState, Spinner, Table, useToast } from "@chanho/react";
import { Eye } from "lucide-react";
import { SettingsHeader } from "../components/SettingsItem";
import type { WatchedPage, WatchedSpace, WatchList } from "../store/types";
import { listWatches, unwatchMany } from "../store/wikiStore";

/** 표 행 — DS Table은 string id를 요구한다 */
type PageRow = WatchedPage & { id: string };
type SpaceRow = WatchedSpace & { id: string };

/**
 * 구독 목록(`/settings/watches`, F-06) — 무엇을 구독했는지 보고 여러 개를 한꺼번에 해제한다(컨플 Watching 목록).
 * 권한을 잃은 문서·스페이스는 서버가 `hidden`으로 주고 제목을 비운다 — 이름은 가리되 해제는 할 수 있어야 한다
 * (알림이 계속 오는 것을 끌 길이 없으면 안 된다).
 */
export function WatchesPage() {
  const toast = useToast();
  const [list, setList] = useState<WatchList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [selectedSpaces, setSelectedSpaces] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setList(await listWatches());
      setSelectedPages(new Set());
      setSelectedSpaces(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  const unwatchSelected = async () => {
    if (selectedPages.size === 0 && selectedSpaces.size === 0) return;
    setBusy(true);
    try {
      await unwatchMany({ pageIds: [...selectedPages], spaceIds: [...selectedSpaces] });
      toast({ title: `${selectedPages.size + selectedSpaces.size}개 구독을 해제했습니다`, appearance: "success" });
      await reload();
    } catch (e) {
      toast({
        title: "구독을 해제하지 못했습니다",
        description: e instanceof Error ? e.message : String(e),
        appearance: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <SettingsHeader
      icon={<Eye size={20} aria-hidden="true" />}
      title="구독"
      description="구독한 문서·스페이스에 변화가 있으면 알림이 옵니다. 여러 개를 골라 한꺼번에 해제할 수 있습니다."
    />
  );

  if (error !== null) {
    return (
      <div className="watches-page">
        {header}
        <Banner variant="danger" action={{ label: "다시 시도", onClick: () => void reload() }}>
          구독 목록을 불러오지 못했습니다: {error}
        </Banner>
      </div>
    );
  }
  if (list === null) {
    return (
      <div className="watches-page">
        {header}
        <Spinner label="구독 목록 불러오는 중" />
      </div>
    );
  }

  const pageRows: PageRow[] = list.pages.map((p) => ({ ...p, id: p.pageId }));
  const spaceRows: SpaceRow[] = list.spaces.map((s) => ({ ...s, id: s.spaceId }));
  const selectedCount = selectedPages.size + selectedSpaces.size;

  return (
    <div className="watches-page">
      {header}
      {pageRows.length === 0 && spaceRows.length === 0 ? (
        <EmptyState
          media={<Eye size={32} aria-hidden="true" />}
          title="구독한 항목이 없습니다"
          description="문서나 스페이스의 구독 버튼을 누르면 여기에 모입니다. 만들거나 고치거나 댓글을 단 문서는 자동으로 구독됩니다."
        />
      ) : (
        <>
          <div className="watches-actions">
            <Button disabled={selectedCount === 0} loading={busy} onClick={() => void unwatchSelected()}>
              {selectedCount > 0 ? `구독 해제 (${selectedCount})` : "구독 해제"}
            </Button>
          </div>
          {pageRows.length > 0 ? (
            <section aria-labelledby="watches-pages-title">
              <h2 id="watches-pages-title" className="watches-section-title">문서 {pageRows.length}개</h2>
              <Table<PageRow>
                aria-label="구독한 문서"
                rows={pageRows}
                columns={[
                  {
                    key: "select",
                    header: "선택",
                    width: "56px",
                    adjustable: false,
                    render: (row) => (
                      <Checkbox
                        label={`${row.hidden ? "볼 수 없는 문서" : (row.title ?? "제목 없음")} 선택`}
                        labelHidden
                        checked={selectedPages.has(row.pageId)}
                        onCheckedChange={(on) => setSelectedPages((s) => toggle(s, row.pageId, on === true))}
                      />
                    ),
                  },
                  {
                    key: "title",
                    header: "문서",
                    render: (row) =>
                      row.hidden ? (
                        <span className="watches-hidden">볼 수 없는 문서</span>
                      ) : (
                        <Link to={`/spaces/${row.spaceId}/pages/${row.pageId}`}>{row.title ?? "제목 없음"}</Link>
                      ),
                  },
                  { key: "spaceName", header: "스페이스", render: (row) => (row.hidden ? "" : (row.spaceName ?? "")) },
                ]}
              />
            </section>
          ) : null}
          {spaceRows.length > 0 ? (
            <section aria-labelledby="watches-spaces-title">
              <h2 id="watches-spaces-title" className="watches-section-title">스페이스 {spaceRows.length}개</h2>
              <Table<SpaceRow>
                aria-label="구독한 스페이스"
                rows={spaceRows}
                columns={[
                  {
                    key: "select",
                    header: "선택",
                    width: "56px",
                    adjustable: false,
                    render: (row) => (
                      <Checkbox
                        label={`${row.hidden ? "볼 수 없는 스페이스" : (row.name ?? "이름 없음")} 선택`}
                        labelHidden
                        checked={selectedSpaces.has(row.spaceId)}
                        onCheckedChange={(on) => setSelectedSpaces((s) => toggle(s, row.spaceId, on === true))}
                      />
                    ),
                  },
                  {
                    key: "name",
                    header: "스페이스",
                    render: (row) =>
                      row.hidden ? (
                        <span className="watches-hidden">볼 수 없는 스페이스</span>
                      ) : (
                        <Link to={`/spaces/${row.spaceId}`}>{row.name ?? "이름 없음"}</Link>
                      ),
                  },
                ]}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
