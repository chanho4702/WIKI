import { Editor } from "@tiptap/core";
import * as Y from "yjs";
import { afterEach, describe, expect, it } from "vitest";
import { parseMarkdown } from "../markdown";
import {
  buildCollaborationExtensions,
  COLLABORATION_FIELD,
} from "./collaboration";

const editors: Editor[] = [];
const documents: Y.Doc[] = [];

function createDocument(): Y.Doc {
  const document = new Y.Doc();
  documents.push(document);
  return document;
}

function createEditor(document: Y.Doc): Editor {
  const editor = new Editor({
    extensions: buildCollaborationExtensions({ document }),
  });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
  documents.splice(0).forEach((document) => document.destroy());
});

describe("Tiptap 2.27 + Yjs collaboration 호환 spike", () => {
  it("현재 위키 스키마를 Yjs에 올리고 StarterKit history는 중복 등록하지 않는다", () => {
    const document = createDocument();
    const editor = createEditor(document);

    const names = editor.extensionManager.extensions.map((extension) => extension.name);
    expect(names).toContain("collaboration");
    expect(names).not.toContain("history");
    expect(document.getXmlFragment(COLLABORATION_FIELD)).toBeDefined();
  });

  it("서로 끊긴 두 편집자의 동시 변경을 교환해 같은 문서로 수렴한다", () => {
    const aliceDocument = createDocument();
    const seedEditor = createEditor(aliceDocument);
    seedEditor.commands.setContent(parseMarkdown("## 공동 문서\n\n기준 [[Roadmap]]"));
    seedEditor.destroy();
    editors.splice(editors.indexOf(seedEditor), 1);

    const bobDocument = createDocument();
    Y.applyUpdate(bobDocument, Y.encodeStateAsUpdate(aliceDocument));
    const alice = createEditor(aliceDocument);
    const bob = createEditor(bobDocument);
    expect(bob.getJSON()).toEqual(alice.getJSON());

    const sharedState = Y.encodeStateVector(aliceDocument);
    alice.commands.insertContentAt(alice.state.doc.content.size, " Alice");
    bob.commands.insertContentAt(1, "Bob ");

    const aliceUpdate = Y.encodeStateAsUpdate(aliceDocument, sharedState);
    const bobUpdate = Y.encodeStateAsUpdate(bobDocument, sharedState);
    Y.applyUpdate(aliceDocument, bobUpdate);
    Y.applyUpdate(bobDocument, aliceUpdate);

    expect(alice.getJSON()).toEqual(bob.getJSON());
    expect(alice.getText()).toContain("Alice");
    expect(alice.getText()).toContain("Bob");
    expect(alice.getJSON()).toEqual(expect.objectContaining({ type: "doc" }));
  });
});
