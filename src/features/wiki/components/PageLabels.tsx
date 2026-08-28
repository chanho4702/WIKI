import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, TextField, useToast } from "@chanho/react";
import { Tag, X } from "lucide-react";
import { listLabels, setLabels } from "../store/wikiStore";

/**
 * 페이지 라벨(W21-2) — 컨플루언스처럼 본문 아래에 칩으로 붙는다.
 *
 * 라벨을 클릭하면 그 라벨이 붙은 문서 목록으로 간다. 이게 없으면 라벨은 그냥 장식이라
 * "붙일 수 있다"만으로는 기능이 완성되지 않는다.
 *
 * 편집 권한은 프론트가 알 수 없으므로 입력을 감추지 않고, 서버 403 메시지를 그대로 보여준다.
 */
export function PageLabels({ pageId, spaceId }: { pageId: string; spaceId: string }) {
  const toast = useToast();
  const [labels, setLabelState] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLabelState(await listLabels(pageId));
    } catch {
      setLabelState([]); // 라벨을 못 읽는다고 본문 화면을 망가뜨리지 않는다
    }
  }, [pageId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const commit = async (next: string[]) => {
    setBusy(true);
    try {
      setLabelState(await setLabels(pageId, next));
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), appearance: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const value = draft.trim();
    if (!value || labels === null) return;
    setDraft("");
    setAdding(false);
    await commit([...labels, value]);
  };

  if (labels === null) return null;

  return (
    <section className="page-labels" aria-label="라벨">
      <Tag size={14} aria-hidden="true" className="page-labels-icon" />
      <ul className="page-labels-list">
        {labels.map((name) => (
          <li key={name} className="page-label-chip">
            <Link to={`/spaces/${spaceId}/labels/${encodeURIComponent(name)}`}>{name}</Link>
            <button
              type="button"
              className="page-label-remove"
              aria-label={`라벨 ${name} 제거`}
              disabled={busy}
              onClick={() => void commit(labels.filter((l) => l !== name))}
            >
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="page-labels-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <TextField
            label="라벨 추가"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (!draft.trim()) setAdding(false);
            }}
            placeholder="예: design"
          />
          <Button type="submit" size="small" disabled={busy}>
            추가
          </Button>
        </form>
      ) : (
        <Button variant="subtle" size="small" onClick={() => setAdding(true)}>
          라벨 추가
        </Button>
      )}
    </section>
  );
}
