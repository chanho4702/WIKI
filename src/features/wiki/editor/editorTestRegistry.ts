import type { Editor } from "@tiptap/core";

/**
 * 테스트 시임 — jsdom에서 contenteditable 타이핑 시뮬레이션이 불안정하므로,
 * App 통합 테스트는 이 레지스트리로 에디터 인스턴스에 접근해 commands로 입력한다.
 * 프로덕션 코드는 이 모듈을 읽지 않는다(쓰기만 한다).
 */
export const editorRegistry: { current: Editor | null } = { current: null };
