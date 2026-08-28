import type { Extensions } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import type * as Y from "yjs";
import type { WikiLinkTarget } from "../../lib/wikiLinks";
import { buildBaseExtensions } from "./base";

/** Node 서비스와 프론트가 같은 Y.XmlFragment를 열도록 고정하는 교차 런타임 계약. */
export const COLLABORATION_FIELD = "prosemirror";

interface CollaborationExtensionOptions {
  document: Y.Doc;
  getPages?: () => WikiLinkTarget[];
}

/**
 * 현재 위키 스키마를 그대로 Yjs에 연결한다.
 *
 * 일반 편집기와 별도 빌더를 두되 스키마 노드는 buildBaseExtensions에서만 가져온다. 여기서 history를
 * 끄지 않으면 StarterKit history와 Yjs undo manager가 같은 단축키를 동시에 처리해 undo가 갈라진다.
 */
export function buildCollaborationExtensions(
  options: CollaborationExtensionOptions,
): Extensions {
  return [
    ...buildBaseExtensions({
      getPages: options.getPages,
      history: false,
    }),
    Collaboration.configure({
      document: options.document,
      field: COLLABORATION_FIELD,
    }),
  ];
}
