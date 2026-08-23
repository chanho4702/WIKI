import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import type { User } from "../../store/types";
import { USER_MENTION_NAME, sanitizeMentionName } from "./userMention";

const MAX_SUGGESTIONS = 8;

/** 이름 부분일치 — 링크 라벨을 깨뜨리는 이름([, ], 개행)은 후보에서 제외한다. */
export function filterMentionCandidates(users: User[], query: string): User[] {
  const q = query.toLowerCase();
  return users
    .filter((u) => !/[[\]\n]/.test(u.name))
    .filter((u) => u.name.toLowerCase().includes(q))
    .slice(0, MAX_SUGGESTIONS);
}

export interface UserMentionSuggestionOptions {
  getUsers: () => User[];
  /** 팝업 상태 브릿지 — wikiLinkSuggestion과 같은 계약. null이면 닫힘. */
  onStateChange: (state: {
    items: User[];
    highlight: number;
    clientRect: DOMRect | null;
    command: (item: User) => void;
  } | null) => void;
}

/**
 * `@` 자동완성 — 사용자 디렉터리(org-service)에서 멘션 대상을 고른다.
 * 팝업 렌더는 WikiEditor가 SuggestionPopup으로 그린다(wikiLinkSuggestion 패턴).
 */
export const UserMentionSuggestion = Extension.create<UserMentionSuggestionOptions>({
  name: "userMentionSuggestion",

  addOptions() {
    return { getUsers: () => [], onStateChange: () => {} };
  },

  addProseMirrorPlugins() {
    const { getUsers, onStateChange } = this.options;
    let items: User[] = [];
    let highlight = 0;
    let clientRect: (() => DOMRect | null) | null = null;
    let command: ((item: User) => void) | null = null;

    const emit = () =>
      onStateChange(
        items.length && command
          ? { items, highlight, clientRect: clientRect?.() ?? null, command }
          : null,
      );

    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey("userMentionSuggestion"),
        char: "@",
        allowSpaces: false,
        startOfLine: false,
        command: ({ editor, range, props }) => {
          const user = props as User;
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: USER_MENTION_NAME,
                attrs: { userId: user.id, name: sanitizeMentionName(user.name) },
              },
              { type: "text", text: " " },
            ])
            .run();
        },
        items: ({ query }) => filterMentionCandidates(getUsers(), query),
        render: () => ({
          onStart(props) {
            items = props.items as User[];
            highlight = 0;
            clientRect = props.clientRect ?? null;
            command = props.command as (item: User) => void;
            emit();
          },
          onUpdate(props) {
            items = props.items as User[];
            highlight = Math.min(highlight, Math.max(items.length - 1, 0));
            clientRect = props.clientRect ?? null;
            command = props.command as (item: User) => void;
            emit();
          },
          onKeyDown(props) {
            if (props.event.key === "Escape") {
              items = [];
              emit();
              return true;
            }
            if (props.event.key === "ArrowDown") {
              if (items.length === 0) return false;
              highlight = (highlight + 1) % items.length;
              emit();
              return true;
            }
            if (props.event.key === "ArrowUp") {
              if (items.length === 0) return false;
              highlight = (highlight - 1 + items.length) % items.length;
              emit();
              return true;
            }
            if (props.event.key === "Enter" && items.length && command) {
              command(items[highlight]);
              return true;
            }
            return false;
          },
          onExit() {
            items = [];
            emit();
          },
        }),
      }),
    ];
  },
});
