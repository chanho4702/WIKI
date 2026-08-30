import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Page } from "../store/types";
import { getPage, listPagesWithLabel } from "../store/wikiStore";
import { extractProperties, plainValue, type PageProperty } from "../lib/properties";
import { contentPathIn } from "../lib/contentPath";

/** 한 보고서가 모으는 문서 상한 — 그보다 많으면 표가 아니라 검색이 맞다. */
export const REPORT_LIMIT = 50;

interface ReportRow {
  page: Pick<Page, "id" | "title" | "type">;
  props: PageProperty[];
}

/**
 * 속성 보고서(`::properties-report[라벨]`, W23) — 라벨이 붙은 문서들의 `:::properties` 표를 한 표로.
 *
 * 컨플루언스 Page Properties Report. "프로젝트" 라벨이 붙은 문서마다 담당자·상태·기한을 적어 두면
 * 이 한 줄이 현황판이 된다. 검색 색인이 아니라 라벨 API + 본문에서 읽으므로 OpenSearch 유무와
 * 무관하다 — 대신 문서 수 상한을 둔다.
 */
export function PropertiesReport({ label, spaceId }: { label: string; spaceId: string }) {
  const [state, setState] = useState<{ kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; rows: ReportRow[]; total: number }>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const pages = await listPagesWithLabel(spaceId, label);
        const picked = pages.slice(0, REPORT_LIMIT);
        const rows: ReportRow[] = [];
        for (const p of picked) {
          const full = await getPage(p.id);
          if (!full) continue;
          const props = extractProperties(full.body);
          if (props && props.length > 0) rows.push({ page: { id: full.id, title: full.title, type: full.type }, props });
        }
        if (!cancelled) setState({ kind: "ok", rows, total: pages.length });
      } catch (e) {
        if (!cancelled) setState({ kind: "error", message: e instanceof Error ? e.message : "속성 보고서를 만들지 못했습니다" });
      }
    })();
    return () => { cancelled = true; };
  }, [spaceId, label]);

  if (state.kind === "loading") return <div className="md-properties-report" role="status">속성 보고서 만드는 중…</div>;
  if (state.kind === "error") return <div className="md-properties-report is-broken">속성 보고서: {state.message}</div>;
  if (state.rows.length === 0) {
    return (
      <div className="md-properties-report is-empty">
        “{label}” 라벨이 붙은 문서 중 속성 표(<code>:::properties</code>)가 있는 문서가 없습니다
      </div>
    );
  }

  // 열은 처음 나온 순서대로 — 문서마다 키가 조금씩 달라도 한 표에 들어간다
  const columns: string[] = [];
  for (const row of state.rows) for (const p of row.props) if (!columns.includes(p.key)) columns.push(p.key);

  return (
    <div className="md-properties-report">
      <table aria-label={`속성 보고서: ${label}`}>
        <thead>
          <tr>
            <th scope="col">문서</th>
            {columns.map((c) => <th key={c} scope="col">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {state.rows.map((row) => (
            <tr key={row.page.id}>
              <th scope="row"><Link to={contentPathIn(spaceId, row.page)}>{row.page.title}</Link></th>
              {columns.map((c) => <td key={c}>{plainValue(row.props.find((p) => p.key === c)?.value ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {state.total > REPORT_LIMIT ? (
        <p className="md-properties-report-note">문서 {state.total}건 중 처음 {REPORT_LIMIT}건만 모았습니다.</p>
      ) : null}
    </div>
  );
}
