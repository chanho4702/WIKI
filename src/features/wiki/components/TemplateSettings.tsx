import { useCallback, useEffect, useState } from "react";
import { Button, ConfirmDialog, EmptyState, TextArea, TextField, useToast } from "@chanho/react";
import { LayoutTemplate, Pencil, Trash2 } from "lucide-react";
import type { PageTemplate } from "../store/types";
import { createTemplate, deleteTemplate, listTemplates, updateTemplate } from "../store/wikiStore";

/**
 * 스페이스 설정의 템플릿 탭(W23).
 *
 * 템플릿은 그 스페이스의 모든 사람이 새 문서를 만들 때 마주치는 공용 자산이라 관리 권한이
 * 필요하다 — 서버가 ADMIN을 요구하고, 여기서는 그 거절을 그대로 보여준다(권한 탭과 같은 방식).
 *
 * 본문은 마크다운 그대로 편집한다. 여기에 리치 에디터를 붙이면 편집기 스키마와 템플릿 저장
 * 형식이 갈라질 위험이 생기는데, 템플릿은 대개 머리말과 빈 섹션 몇 줄이라 그럴 값어치가 없다.
 */
export function TemplateSettings({ spaceId }: { spaceId: string }) {
  const toast = useToast();
  const [templates, setTemplates] = useState<PageTemplate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PageTemplate | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PageTemplate | null>(null);

  const reload = useCallback(async () => {
    try {
      setTemplates(await listTemplates(spaceId));
      setError(null);
    } catch (reason) {
      setTemplates([]);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [spaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const startNew = () => {
    setName("");
    setDescription("");
    setContent("");
    setEditing("new");
  };

  const startEdit = (template: PageTemplate) => {
    setName(template.name);
    setDescription(template.description ?? "");
    setContent(template.content);
    setEditing(template);
  };

  const save = async () => {
    if (editing === null) return;
    setSaving(true);
    try {
      const input = { name, description: description.trim() || null, content };
      if (editing === "new") await createTemplate(spaceId, input);
      else await updateTemplate(editing.id, input);
      setEditing(null);
      await reload();
      toast({ title: "템플릿을 저장했습니다", appearance: "success" });
    } catch (reason) {
      toast({
        title: "템플릿 저장 실패",
        description: reason instanceof Error ? reason.message : String(reason),
        appearance: "danger",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTemplate(pendingDelete.id);
      setPendingDelete(null);
      await reload();
    } catch (reason) {
      toast({
        title: "템플릿 삭제 실패",
        description: reason instanceof Error ? reason.message : String(reason),
        appearance: "danger",
      });
    }
  };

  if (error) {
    return <EmptyState title="템플릿을 볼 수 없습니다" description={error} />;
  }

  return (
    <div className="space-settings-form">
      {editing !== null ? (
        <form
          className="template-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <TextField
            label="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
          <TextField
            label="설명 (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
          />
          <TextArea
            label="본문 (마크다운)"
            value={content}
            rows={10}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="template-form-actions">
            <Button type="submit" disabled={!name.trim() || saving}>
              저장
            </Button>
            <Button type="button" variant="subtle" onClick={() => setEditing(null)}>
              취소
            </Button>
          </div>
        </form>
      ) : (
        <Button onClick={startNew}>
          <LayoutTemplate size={16} aria-hidden="true" />
          템플릿 만들기
        </Button>
      )}

      {templates === null ? (
        <span role="status">템플릿 로딩 중</span>
      ) : templates.length === 0 ? (
        <EmptyState
          title="템플릿이 없습니다"
          description="반복해서 쓰는 문서 형태를 템플릿으로 두면 새 문서를 빈 화면에서 시작하지 않아도 됩니다."
        />
      ) : (
        <ul className="template-list" aria-label="템플릿 목록">
          {templates.map((template) => (
            <li key={template.id} className="template-list-item">
              <div className="template-list-copy">
                <strong>{template.name}</strong>
                {template.description ? <span>{template.description}</span> : null}
              </div>
              <div className="template-list-actions">
                <Button
                  size="small"
                  variant="subtle"
                  aria-label={`${template.name} 편집`}
                  onClick={() => startEdit(template)}
                >
                  <Pencil size={14} aria-hidden="true" />
                </Button>
                <Button
                  size="small"
                  variant="subtle"
                  aria-label={`${template.name} 삭제`}
                  onClick={() => setPendingDelete(template)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="템플릿을 삭제할까요?"
        description={
          pendingDelete
            ? `"${pendingDelete.name}"이(가) 사라집니다. 이 템플릿으로 만든 문서는 그대로 남습니다.`
            : undefined
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        onConfirm={() => void remove()}
      />
    </div>
  );
}
