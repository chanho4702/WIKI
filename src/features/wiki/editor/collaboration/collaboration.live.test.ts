import { Editor } from "@tiptap/core";
import {
  HocuspocusProvider,
  type HocuspocusProviderConfiguration,
} from "@hocuspocus/provider";
import { describe, expect, it } from "vitest";
import NodeWebSocket from "ws";
import * as Y from "yjs";
import { buildCollaborationExtensions } from "../extensions/collaboration";
import { createCollaborationBootstrapState } from "./session";
import { COLLABORATION_TITLE_FIELD, replaceCollaborativeTitle } from "./title";

const phase = import.meta.env.VITE_COLLABORATION_LIVE_PHASE as string | undefined;
const gateway = (import.meta.env.VITE_COLLABORATION_LIVE_GATEWAY as string | undefined)
  ?? "http://localhost";
const pageId = (import.meta.env.VITE_COLLABORATION_LIVE_PAGE_ID as string | undefined)
  ?? "987654321";
const rawTickets = import.meta.env.VITE_COLLABORATION_LIVE_TICKETS as string | undefined;
const enabled = phase === "seed" || phase === "recover";
const room = `page:${pageId}`;
const websocketUrl = `${gateway.replace(/^http/, "ws")}/api/wiki/collaboration`;
const initialTitle = "공동 편집 검증";
const expectedTitle = "새 공동 편집 검증 v2";
const initialMarkdown = [
  "# 공동 편집 검증",
  "",
  "alpha shared omega",
  "",
  "| 역할 | 상태 |",
  "| --- | --- |",
  "| Alice | 준비 |",
  "| Bob | 준비 |",
].join("\n");

function tickets(): string[] {
  if (!rawTickets) throw new Error("live collaboration ticket이 없습니다");
  const parsed: unknown = JSON.parse(rawTickets);
  if (!Array.isArray(parsed) || parsed.some((ticket) => typeof ticket !== "string")) {
    throw new Error("live collaboration ticket 형식이 올바르지 않습니다");
  }
  return parsed;
}

function waitForSync(document: Y.Doc, ticket: string): Promise<HocuspocusProvider> {
  return new Promise((resolve, reject) => {
    let provider: HocuspocusProvider;
    let lastStatus = "created";
    let lastClose = "none";
    const timeout = window.setTimeout(() => {
      provider?.destroy();
      reject(new Error(`공동 편집 동기화 시간이 초과되었습니다 (${lastStatus}, ${lastClose})`));
    }, 15_000);
    const configuration = {
      url: websocketUrl,
      WebSocketPolyfill: NodeWebSocket,
      name: room,
      document,
      token: ticket,
      onStatus: ({ status }) => {
        lastStatus = status;
      },
      onClose: ({ event }) => {
        lastClose = `${event.code}:${event.reason || "no-reason"}`;
      },
      onSynced: ({ state }) => {
        if (!state) return;
        window.clearTimeout(timeout);
        resolve(provider);
      },
      onAuthenticationFailed: () => {
        window.clearTimeout(timeout);
        provider.destroy();
        reject(new Error("공동 편집 인증에 실패했습니다"));
      },
    } satisfies HocuspocusProviderConfiguration & { WebSocketPolyfill: typeof NodeWebSocket };
    provider = new HocuspocusProvider(configuration);
  });
}

async function waitUntil(check: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  throw new Error(message);
}

function editor(document: Y.Doc): Editor {
  return new Editor({ extensions: buildCollaborationExtensions({ document }) });
}

function textRange(instance: Editor, value: string): { from: number; to: number } {
  let result: { from: number; to: number } | null = null;
  instance.state.doc.descendants((node, position) => {
    if (result || !node.isText || !node.text) return;
    const offset = node.text.indexOf(value);
    if (offset >= 0) result = { from: position + offset, to: position + offset + value.length };
  });
  if (!result) throw new Error(`편집할 텍스트를 찾지 못했습니다: ${value}`);
  return result;
}

function rowCount(instance: Editor): number {
  let count = 0;
  instance.state.doc.descendants((node) => {
    if (node.type.name === "tableRow") count += 1;
  });
  return count;
}

function hasBoldAlpha(instance: Editor): boolean {
  let found = false;
  instance.state.doc.descendants((node) => {
    if (node.isText && node.text?.includes("alpha") && node.marks.some((mark) => mark.type.name === "bold")) {
      found = true;
    }
  });
  return found;
}

async function bootstrap(ticket: string): Promise<void> {
  const response = await fetch(`${gateway}/api/wiki/collaboration/pages/${pageId}/bootstrap`, {
    method: "POST",
    headers: {
      Authorization: `Collaboration ${ticket}`,
      "Content-Type": "application/octet-stream",
      "X-Wiki-Page-Version": "1",
    },
    body: createCollaborationBootstrapState(initialTitle, initialMarkdown) as BodyInit,
  });
  if (!response.ok) throw new Error(`공동 편집 bootstrap 실패: HTTP ${response.status}`);
}

describe.skipIf(!enabled)("collaboration live smoke", () => {
  it("동시 제목·서식·표 편집을 수렴시키고 프로세스 재기동 뒤 복구한다", async () => {
    const issued = tickets();

    if (phase === "seed") {
      expect(issued).toHaveLength(5);
      await bootstrap(issued[0]);
      const aliceDocument = new Y.Doc();
      const bobDocument = new Y.Doc();
      const firstProviders = await Promise.all([
        waitForSync(aliceDocument, issued[1]),
        waitForSync(bobDocument, issued[2]),
      ]);
      const aliceEditor = editor(aliceDocument);
      const bobEditor = editor(bobDocument);
      let secondProviders: HocuspocusProvider[] = [];
      try {
        await waitUntil(
          () => JSON.stringify(aliceEditor.getJSON()) === JSON.stringify(bobEditor.getJSON()),
          "두 클라이언트의 최초 본문이 수렴하지 않았습니다",
        );
        firstProviders.forEach((provider) => provider.destroy());

        replaceCollaborativeTitle(
          aliceDocument.getText(COLLABORATION_TITLE_FIELD),
          `새 ${initialTitle}`,
        );
        aliceEditor.chain().setTextSelection(textRange(aliceEditor, "alpha")).toggleBold().run();

        replaceCollaborativeTitle(
          bobDocument.getText(COLLABORATION_TITLE_FIELD),
          `${initialTitle} v2`,
        );
        bobEditor.chain().setTextSelection(textRange(bobEditor, "Bob")).addRowAfter().run();

        secondProviders = await Promise.all([
          waitForSync(aliceDocument, issued[3]),
          waitForSync(bobDocument, issued[4]),
        ]);
        await waitUntil(
          () => aliceDocument.getText(COLLABORATION_TITLE_FIELD).toString() === expectedTitle
            && bobDocument.getText(COLLABORATION_TITLE_FIELD).toString() === expectedTitle
            && JSON.stringify(aliceEditor.getJSON()) === JSON.stringify(bobEditor.getJSON())
            && hasBoldAlpha(aliceEditor)
            && hasBoldAlpha(bobEditor)
            && rowCount(aliceEditor) === 4
            && rowCount(bobEditor) === 4,
          "동시 제목·서식·표 편집이 수렴하지 않았습니다",
        );
      } finally {
        secondProviders.forEach((provider) => provider.destroy());
        firstProviders.forEach((provider) => provider.destroy());
        aliceEditor.destroy();
        bobEditor.destroy();
        aliceDocument.destroy();
        bobDocument.destroy();
      }
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
      return;
    }

    expect(issued).toHaveLength(2);
    const aliceDocument = new Y.Doc();
    const bobDocument = new Y.Doc();
    const providers = await Promise.all([
      waitForSync(aliceDocument, issued[0]),
      waitForSync(bobDocument, issued[1]),
    ]);
    const aliceEditor = editor(aliceDocument);
    const bobEditor = editor(bobDocument);
    try {
      await waitUntil(
        () => aliceDocument.getText(COLLABORATION_TITLE_FIELD).toString() === expectedTitle
          && bobDocument.getText(COLLABORATION_TITLE_FIELD).toString() === expectedTitle
          && JSON.stringify(aliceEditor.getJSON()) === JSON.stringify(bobEditor.getJSON())
          && hasBoldAlpha(aliceEditor)
          && hasBoldAlpha(bobEditor)
          && rowCount(aliceEditor) === 4
          && rowCount(bobEditor) === 4,
        "프로세스 재기동 뒤 PostgreSQL 공유 초안을 복구하지 못했습니다",
      );
    } finally {
      providers.forEach((provider) => provider.destroy());
      aliceEditor.destroy();
      bobEditor.destroy();
      aliceDocument.destroy();
      bobDocument.destroy();
    }
  }, 45_000);
});
