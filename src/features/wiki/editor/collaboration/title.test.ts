import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { COLLABORATION_TITLE_FIELD, replaceCollaborativeTitle } from "./title";

function title(document: Y.Doc): Y.Text {
  return document.getText(COLLABORATION_TITLE_FIELD);
}

describe("collaborative title", () => {
  it("한글·emoji를 쪼개지 않고 실제 변경 구간만 교체한다", () => {
    const document = new Y.Doc();
    title(document).insert(0, "기획 🧭 문서");
    replaceCollaborativeTitle(title(document), "기획 🧭 초안");
    expect(title(document).toString()).toBe("기획 🧭 초안");
    document.destroy();
  });

  it("서로 다른 위치의 동시 제목 편집도 update 교환 뒤 수렴한다", () => {
    const seed = new Y.Doc();
    title(seed).insert(0, "플랫폼 문서");
    const initial = Y.encodeStateAsUpdate(seed);
    const alice = new Y.Doc();
    const bob = new Y.Doc();
    Y.applyUpdate(alice, initial);
    Y.applyUpdate(bob, initial);
    const vector = Y.encodeStateVector(alice);

    replaceCollaborativeTitle(title(alice), "새 플랫폼 문서");
    replaceCollaborativeTitle(title(bob), "플랫폼 문서 v2");
    const aliceUpdate = Y.encodeStateAsUpdate(alice, vector);
    const bobUpdate = Y.encodeStateAsUpdate(bob, vector);
    Y.applyUpdate(alice, bobUpdate);
    Y.applyUpdate(bob, aliceUpdate);

    expect(title(alice).toString()).toBe(title(bob).toString());
    expect(title(alice).toString()).toContain("새 ");
    expect(title(alice).toString()).toContain(" v2");
    seed.destroy();
    alice.destroy();
    bob.destroy();
  });
});
