import { describe, expect, it } from "vitest";
import { canCommitCollaborationDraft } from "./availability";

describe("collaboration draft availability", () => {
  it("동기화된 Y.Doc과 generation이 모두 있을 때만 저장·게시를 허용한다", () => {
    expect(canCommitCollaborationDraft("synced", true, 3)).toBe(true);
    expect(canCommitCollaborationDraft("syncing", true, 3)).toBe(false);
    expect(canCommitCollaborationDraft("reconnecting", true, 3)).toBe(false);
    expect(canCommitCollaborationDraft("offline", true, 3)).toBe(false);
    expect(canCommitCollaborationDraft("error", true, 3)).toBe(false);
    expect(canCommitCollaborationDraft("synced", false, 3)).toBe(false);
    expect(canCommitCollaborationDraft("synced", true, null)).toBe(false);
  });
});
