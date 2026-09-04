import { useEffect, useMemo, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { ConfirmDialog, Dropdown, EmptyState } from "@chanho/react";
import { FileText, Folder, LayoutTemplate, Newspaper } from "lucide-react";
import type { PageTemplate, PageType } from "../store/types";
import { listTemplates } from "../store/wikiStore";
import { builtinTemplatesFor } from "../lib/builtinTemplates";

export interface CreateContentMenuProps {
  /** 드롭다운을 여는 요소 — 진입점마다 다르다(헤더는 라벨 버튼, 트리·사이드바는 아이콘 버튼).
   *  Dropdown이 ref/aria를 주입하려면 단일 엘리먼트여야 한다(ReactNode 불가). */
  trigger: ReactElement;
  onSelect: (type: PageType) => void;
  /**
   * 템플릿에서 만들기. 스페이스가 정해진 진입점만 넘긴다 — 템플릿은 스페이스 스코프라
   * 스페이스 밖(홈·디렉토리)에서는 고를 대상이 없다.
   */
  spaceId?: string | null;
  onSelectTemplate?: (template: PageTemplate) => void;
  /** 진입점 고유 항목(예: 헤더의 "새 스페이스") — 페이지·폴더 아래에 붙는다. */
  extraItems?: Array<{ label: string; icon?: ReactNode; onSelect: () => void }>;
}

/**
 * "무엇을 만들지" 고르는 공용 메뉴.
 *
 * 전에는 헤더와 폴더 화면에만 선택지가 있고 스페이스 개요·사이드바·트리 행의 +는 페이지만
 * 만들었다 — 같은 `+`인데 어디서 눌렀느냐에 따라 폴더를 만들 수 있기도 없기도 했다.
 * 진입점마다 메뉴를 따로 짜면 또 갈라지므로 항목 구성을 여기 하나로 모은다.
 */
export function CreateContentMenu({
  trigger,
  onSelect,
  spaceId = null,
  onSelectTemplate,
  extraItems = [],
}: CreateContentMenuProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [templates, setTemplates] = useState<PageTemplate[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const templatesEnabled = spaceId !== null && onSelectTemplate !== undefined;
  // 기본 템플릿(W27-1)은 코드에 있어 조회가 필요 없다 — 새 스페이스에서도 목록이 비지 않는다
  const builtins = useMemo(() => (spaceId ? builtinTemplatesFor(spaceId) : []), [spaceId]);

  // 목록은 다이얼로그를 열 때 읽는다 — 메뉴를 그릴 때마다 조회하면 안 쓰는 사람도 비용을 낸다.
  useEffect(() => {
    if (!pickerOpen || !spaceId) return;
    let cancelled = false;
    setTemplates(null);
    setChosen(null);
    void listTemplates(spaceId)
      .then((found) => {
        if (!cancelled) setTemplates(found);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pickerOpen, spaceId]);

  const renderTemplateItem = (template: PageTemplate) => (
    <li key={template.id}>
      {/* 라디오가 아니라 버튼이다 — 고르는 즉시 본문 미리보기가 바뀌어야 한다 */}
      <button
        type="button"
        className={chosen === template.id ? "template-picker-item is-chosen" : "template-picker-item"}
        aria-pressed={chosen === template.id}
        onClick={() => setChosen(template.id)}
      >
        <span className="template-picker-name">
          {template.icon ? <span aria-hidden="true">{template.icon}</span> : null}
          {template.name}
        </span>
        {template.description ? (
          <span className="template-picker-description">{template.description}</span>
        ) : null}
      </button>
    </li>
  );

  return (
    <>
    <Dropdown
      trigger={trigger}
      items={[
        {
          label: "페이지",
          icon: <FileText size={16} aria-hidden="true" />,
          // 초안으로 즉시 만들어 트리에 세운다 — 빈 편집 화면만 열면 뭘 만드는지 확인이 안 된다
          onSelect: () => onSelect("page"),
        },
        {
          label: "폴더",
          icon: <Folder size={16} aria-hidden="true" />,
          onSelect: () => onSelect("folder"),
        },
        // 블로그 글(W24) — 트리 밖에서 날짜순으로 읽는 글. 어디서 눌렀든 부모 없이 만들어진다.
        {
          label: "블로그 글",
          icon: <Newspaper size={16} aria-hidden="true" />,
          onSelect: () => onSelect("blog"),
        },
        ...(templatesEnabled
          ? [{
              label: "템플릿에서",
              icon: <LayoutTemplate size={16} aria-hidden="true" />,
              onSelect: () => setPickerOpen(true),
            }]
          : []),
        ...extraItems,
      ]}
    />

    <ConfirmDialog
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      title="템플릿에서 만들기"
      confirmLabel="만들기"
      cancelLabel="취소"
      onConfirm={() => {
        const template = [...builtins, ...(templates ?? [])].find((t) => t.id === chosen);
        if (!template) return;
        setPickerOpen(false);
        onSelectTemplate?.(template);
      }}
    >
      {/* 기본 템플릿이 먼저다 — 새 스페이스에는 스페이스 템플릿이 없어 빈 목록만 보였다(W27-1) */}
      <div className="template-picker-groups">
        <div className="template-picker-group">
          <p className="template-picker-group-title">기본 템플릿</p>
          <ul className="template-picker-list" aria-label="기본 템플릿">
            {builtins.map(renderTemplateItem)}
          </ul>
        </div>

        <div className="template-picker-group">
          <p className="template-picker-group-title">스페이스 템플릿</p>
          {templates === null ? (
            <p role="status">불러오는 중</p>
          ) : templates.length === 0 ? (
            <EmptyState
              title="템플릿이 없습니다"
              description="스페이스 설정에서 템플릿을 만들면 여기에 나타납니다."
            />
          ) : (
            <ul className="template-picker-list" aria-label="스페이스 템플릿">
              {templates.map(renderTemplateItem)}
            </ul>
          )}
        </div>
      </div>
    </ConfirmDialog>
    </>
  );
}
