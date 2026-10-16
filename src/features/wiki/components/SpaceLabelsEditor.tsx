import { useEffect, useState } from "react";
import { Button, TextField, useToast } from "@chanho/react";
import { Tag, X } from "lucide-react";
import type { Space } from "../store/types";
import { setSpaceLabels } from "../store/wikiStore";

/**
 * 스페이스 라벨 편집(V41) — 스페이스 디렉토리의 "라벨" 열과 필터가 읽는 분류.
 *
 * 문서 라벨(PageLabels)과 모양은 같지만 다른 원장이다: 문서 라벨은 문서를 편집할 수 있는 사람이
 * 붙이고 검색이 읽고, 스페이스 라벨은 스페이스 관리자만 붙이고 디렉토리가 읽는다. 관리자 여부는
 * 화면이 알 수 없어 입력을 감추지 않고 서버의 403 문구를 그대로 보여 준다(PageLabels와 같은 규칙).
 */
export function SpaceLabelsEditor({
  space,
  onSaved,
}: {
  space: Space;
  /** 저장 뒤 디렉토리·셸이 새 라벨을 보도록 스페이스 목록을 다시 읽게 한다. */
  onSaved?: (space: Space) => void | Promise<void>;
}) {
  const toast = useToast();
  const [labels, setLabels] = useState<string[]>(space.labels ?? []);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLabels(space.labels ?? []);
  }, [space.id, space.labels]);

  const commit = async (next: string[]) => {
    setBusy(true);
    try {
      const saved = await setSpaceLabels(space.id, next);
      setLabels(saved.labels ?? []);
      await onSaved?.(saved);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    // 쉼표로 여러 개를 한 번에 — 디렉토리 분류는 처음 정할 때 몇 개를 같이 붙이는 일이 많다.
    const values = draft.split(",").map((v) => v.trim()).filter(Boolean);
    if (values.length === 0) return;
    setDraft("");
    await commit([...labels, ...values]);
  };

  return (
    <section className="space-settings-form space-labels-editor" aria-label="스페이스 라벨">
      <h2 className="space-labels-editor-title">
        <Tag size={16} aria-hidden="true" />
        스페이스 라벨
      </h2>
      <p className="space-labels-editor-hint">
        스페이스 디렉토리에서 이 스페이스를 묶어 보는 분류입니다. 문서 라벨과는 별개이며 관리자만 바꿀 수 있습니다.
      </p>
      {labels.length === 0 ? (
        <p className="space-labels-editor-empty">아직 라벨이 없습니다.</p>
      ) : (
        <ul className="page-labels-list">
          {labels.map((name) => (
            <li key={name} className="page-label-chip">
              <span>{name}</span>
              <button
                type="button"
                className="page-label-remove"
                aria-label={`스페이스 라벨 ${name} 제거`}
                disabled={busy}
                onClick={() => void commit(labels.filter((l) => l !== name))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="space-labels-editor-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <TextField
          label="스페이스 라벨 추가"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="예: engineering, runbook"
        />
        <Button type="submit" size="small" disabled={busy || draft.trim() === ""}>
          추가
        </Button>
      </form>
    </section>
  );
}
