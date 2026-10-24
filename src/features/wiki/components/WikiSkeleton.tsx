import type { ReactNode } from "react";
import { Skeleton, SkeletonAvatar, SkeletonListItem, SkeletonText, TopBar } from "@chanho/react";
import { getSidebarPrefs } from "../lib/sidebarPrefs";

/**
 * 스켈레톤 로딩 — 스피너 대신 콘텐츠 자리를 미리 잡는다(레이아웃 점프 방지 + 무엇이 로드되는지
 * 형태로 예고). 블록은 DS `Skeleton`·`SkeletonText`·`SkeletonAvatar`·`SkeletonListItem`이 그린다(색·쉬머·
 * 움직임 줄이기 정지는 DS 몫 — 앱에 따로 펄스를 두지 않는다).
 *
 * 접근성 계약: 진행 상태는 시각 장식이 아니라 **문구 자체가 role=status인 숨김 span**이 알린다
 * (`findByText(라벨)`이 role=status를 가리킨다 — DS의 `label` 프롭은 문구를 status 영역 안쪽에 두어 이
 * 계약과 모양이 달라 쓰지 않는다). 회색 블록 영역은 `aria-hidden`이고, 테스트·스타일 훅으로
 * `.wiki-skeleton` 클래스를 단다 — 로드가 끝나면 화면에 `.wiki-skeleton`이 하나도 남지 않아야 한다.
 */

type SkeletonTag = "div" | "span" | "ul" | "ol";

interface SkeletonRegionProps {
  label: string;
  /** 장식 영역에 덧붙일 클래스 — 실제 콘텐츠 컨테이너와 같은 클래스를 주면 자리 크기가 같아진다. */
  className?: string;
  /** 문단(<p>) 안처럼 블록 요소를 둘 수 없는 자리는 span. */
  as?: SkeletonTag;
  children: ReactNode;
}

export function SkeletonRegion({ label, className, as: Tag = "div", children }: SkeletonRegionProps) {
  return (
    <>
      <span className="wiki-visually-hidden" role="status">
        {label}
      </span>
      <Tag aria-hidden="true" className={className ? `wiki-skeleton ${className}` : "wiki-skeleton"}>
        {children}
      </Tag>
    </>
  );
}

/** 본문 줄 몇 개 — 줄마다 너비를 달리해 문단처럼 보이게 한다. */
export function SkeletonLines({ label, widths }: { label: string; widths: string[] }) {
  return (
    <SkeletonRegion label={label} className="wiki-skeleton-lines">
      {widths.map((width, i) => (
        <Skeleton key={i} variant="text" width={width} />
      ))}
    </SkeletonRegion>
  );
}

/**
 * 사이드바 페이지 트리 자리 — 실제 트리 행(.page-tree-row: 펼침 칸 24px + 32px 링크 행, 아이콘 16px)과
 * 같은 높이·들여쓰기(단계당 16px)로 그린다.
 */
const TREE_ROWS: ReadonlyArray<{ depth: number; width: string }> = [
  { depth: 0, width: "70%" },
  { depth: 1, width: "56%" },
  { depth: 1, width: "64%" },
  { depth: 0, width: "60%" },
  { depth: 1, width: "48%" },
  { depth: 2, width: "52%" },
];

export function TreeSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className="wiki-skeleton-tree">
      {TREE_ROWS.map(({ depth, width }, i) => (
        <span key={i} className="page-tree-row wiki-skeleton-tree-row" style={{ paddingInlineStart: depth * 16 }}>
          <span className="page-tree-toggle-spacer" />
          <span className="wiki-skeleton-tree-link">
            <Skeleton width={16} height={16} />
            <Skeleton variant="text" width={width} />
          </span>
        </span>
      ))}
    </SkeletonRegion>
  );
}

/** 댓글 자리 — 아바타 원 + 이름/본문 줄. */
export function CommentSkeleton({ label, count = 2 }: { label: string; count?: number }) {
  return (
    <SkeletonRegion label={label} className="wiki-skeleton-comments">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="wiki-skeleton-comment">
          <SkeletonAvatar />
          <div className="wiki-skeleton-lines">
            <Skeleton variant="text" width={120} />
            <Skeleton variant="text" width={i % 2 ? "60%" : "85%"} />
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

/**
 * 문서 자리 — (브레드크럼) + 제목 줄 + (메타 줄) + 본문 문단. 페이지 보기·폴더·스페이스 개요·화면 청크
 * 로딩이 같은 모양을 쓴다. 바깥 래퍼(.page-view 등)는 호출하는 화면이 실제 화면과 같은 것으로 준다.
 */
export function PageSkeleton({
  label,
  breadcrumb = false,
  meta = false,
  paragraphs = [5, 3],
}: {
  label: string;
  breadcrumb?: boolean;
  meta?: boolean;
  /** 문단마다 줄 수 */
  paragraphs?: number[];
}) {
  return (
    <SkeletonRegion label={label} className="page-view-skeleton">
      {breadcrumb ? <Skeleton variant="text" width={200} className="page-view-skeleton-crumb" /> : null}
      <Skeleton width="min(60%, 380px)" className="page-view-skeleton-title" />
      {meta ? <Skeleton variant="text" width={220} className="page-view-skeleton-meta" /> : null}
      <div className="page-view-skeleton-body">
        {paragraphs.map((lines, i) => (
          <SkeletonText key={i} lines={lines} lastLineWidth={i % 2 ? "40%" : "62%"} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** 목록 행 자리 — DS SkeletonListItem(40px 행, 2줄이면 48px). 알림·작업·템플릿처럼 아이콘 + 글줄인 목록. */
export function ListSkeleton({
  label,
  rows = 5,
  media = "icon",
  lines = 2,
  className,
}: {
  label: string;
  rows?: number;
  media?: "avatar" | "icon" | "none";
  lines?: 1 | 2;
  className?: string;
}) {
  const widths = ["62%", "48%", "70%", "55%", "40%", "66%"];
  return (
    <SkeletonRegion label={label} className={className ? `wiki-skeleton-list ${className}` : "wiki-skeleton-list"}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonListItem key={i} media={media} lines={lines} width={widths[i % widths.length]} />
      ))}
    </SkeletonRegion>
  );
}

/**
 * 표(생 <table>) 자리 — 머리글은 실제 이름으로 그대로 두고 몸통 행만 회색 줄로 채운다(열 폭이 로드 전후로
 * 같다). DS Table을 쓰는 화면은 이것 대신 `Table loading`을 쓴다.
 */
export function TableSkeleton({
  label,
  headers,
  rows = 4,
  className,
  wrapClassName,
}: {
  label: string;
  headers: string[];
  rows?: number;
  className: string;
  wrapClassName?: string;
}) {
  const table = (
    <table className={className}>
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, r) => (
          <tr key={r}>
            {headers.map((h, c) => (
              <td key={h}>
                <Skeleton variant="text" width={c === 0 ? `${70 - (r % 3) * 12}%` : "60%"} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <SkeletonRegion label={label} className={wrapClassName}>
      {table}
    </SkeletonRegion>
  );
}

/**
 * 설정·관리 화면 자리 — SettingsHeader(40px 아이콘 배지 + 제목 + 설명)와 판(.space-settings-form) 하나.
 * 바깥 .space-settings는 실제 화면과 같은 래퍼다.
 */
export function SettingsSkeleton({ label, lines = 4 }: { label: string; lines?: number }) {
  return (
    <div className="space-settings">
      <SkeletonRegion label={label} className="wiki-skeleton-settings">
        <div className="settings-header">
          <Skeleton width={40} height={40} radius="medium" />
          <div className="settings-header-text wiki-skeleton-settings-text">
            <Skeleton width={220} height={24} />
            <Skeleton variant="text" width={320} />
          </div>
        </div>
        <div className="space-settings-form">
          <SkeletonText lines={lines} />
        </div>
      </SkeletonRegion>
    </div>
  );
}

/**
 * 앱 셸 자리 — 스페이스 목록·로그인·계정 확인처럼 셸을 그리기 전 단계. 상단바는 DS TopBar 그대로
 * (높이·테두리가 같다), 사이드바는 저장된 폭·접힘을 따라 같은 자리에 트리 자리를 둔다.
 * 라우터 바깥(AuthGate·OrgAccountGate)에서도 쓰므로 Link 등 라우터 의존을 두지 않는다.
 */
export function ShellSkeleton({ label }: { label: string }) {
  const { collapsed, width } = getSidebarPrefs();
  const compact = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 700px)").matches;
  return (
    <div className="wiki-layout">
      {/* 상단바 슬롯 자리 — 사이드바 토글(32px)·전역 검색 칸이 들어올 자리를 비워 두면 로고가 옆으로 튄다 */}
      <TopBar
        brand={
          <>
            <Skeleton width={32} height={32} radius="medium" aria-hidden="true" />
            <span className="wiki-brand">WIKI</span>
          </>
        }
        searchTrailing={<Skeleton width={190} height={32} radius="full" aria-hidden="true" />}
      />
      <div className="wiki-body">
        {collapsed || compact ? null : (
          <aside className="wiki-sidebar wiki-skeleton-sidebar" style={{ width }} aria-hidden="true">
            <div className="wiki-skeleton wiki-skeleton-sidebar-nav">
              {/* 전역 내비 7항목(추천·최근·별표·스페이스·내 스페이스·내 작업·앱)과 같은 줄 수 */}
              {["36%", "30%", "44%", "40%", "50%", "38%", "24%"].map((width, i) => (
                <SkeletonListItem key={i} media="icon" width={width} />
              ))}
            </div>
          </aside>
        )}
        <main className="wiki-content">
          <div className="page-view">
            <PageSkeleton label={label} breadcrumb meta />
          </div>
        </main>
      </div>
    </div>
  );
}

/** 사람 호버 카드 자리 — 문단 안에서도 열리므로 span만 쓴다(.person-card-head와 같은 배치). */
export function PersonCardSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} as="span" className="person-card-head">
      <SkeletonAvatar size="large" />
      <span className="person-card-ident wiki-skeleton-lines">
        <Skeleton variant="text" width={120} />
        <Skeleton variant="text" width={160} />
      </span>
    </SkeletonRegion>
  );
}

/**
 * 편집 화면 자리 — 상단 편집 크롬(.edit-chrome: 제목 + 버튼 묶음), 서식 툴바(.top-toolbar: 28px 버튼 줄),
 * 본문 칼럼(.page-edit-body: 큰 제목 + 본문 줄). 편집기 청크를 받는 동안과 문서 본문을 읽는 동안 같은 모양을 쓴다.
 */
export function EditorSkeleton({ label }: { label: string }) {
  return (
    <div className="page-edit">
      <SkeletonRegion label={label} className="wiki-skeleton-editor">
        <div className="edit-chrome">
          <Skeleton variant="text" width={160} />
          <span className="wiki-skeleton-editor-actions">
            <Skeleton width={72} height={32} radius="medium" />
            <Skeleton width={56} height={32} radius="medium" />
          </span>
        </div>
        <div className="top-toolbar">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} width={28} height={28} radius="medium" />
          ))}
        </div>
        <div className="page-edit-body">
          <Skeleton width="min(60%, 380px)" height={40} className="wiki-skeleton-editor-title" />
          <SkeletonText lines={5} />
          <SkeletonText lines={3} lastLineWidth="40%" />
        </div>
      </SkeletonRegion>
    </div>
  );
}

/**
 * 글줄 하나 자리 — 실제 글줄의 클래스(글자 크기·행간)를 받아 그 줄 높이(1lh)만큼 자리를 차지하고, 회색
 * 막대는 줄 가운데에 놓는다. 12px 막대만 두면 20px 줄보다 낮아 로드 순간 행이 늘어난다.
 */
export function SkeletonLine({ className, width }: { className?: string; width: number | string }) {
  // 비율 너비(문자열)는 줄 칸이 부모 폭을 다 써야 의미가 있다 — 세로 flex(align-items: flex-start)
  // 안에서는 칸이 내용 폭으로 줄어 막대가 0이 된다. 고정 px는 칸이 막대 폭만큼만 차지한다.
  const cls = ["wiki-skeleton-textline", typeof width === "string" ? "wiki-skeleton-textline--fill" : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      <Skeleton variant="text" width={width} />
    </span>
  );
}
