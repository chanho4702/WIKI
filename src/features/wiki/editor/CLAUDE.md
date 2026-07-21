# editor/ — TipTap 블록 에디터 내부 규약

설계 문서(알려진 한계 포함): `docs/superpowers/specs/2026-07-17-block-editor-design.md`

## 스키마·마크다운 왕복 (가장 중요)

- **스키마에 영향 주는 확장은 `extensions/base.ts`에만 추가한다.**
  WikiEditor(화면)와 `markdown.ts`의 헤드리스 변환 에디터가 `buildBaseExtensions()`를 공유해야
  마크다운 왕복(parse ↔ serialize)이 안전하다. 화면 전용 확장(Placeholder, SlashMenu,
  AlertDecoration, DragHandle 등)만 WikiEditor에서 추가한다.
- 저장은 항상 마크다운: `getMarkdown()`은 저장 시점에만 호출, `isDirty() === false`면
  호출부가 원문을 그대로 저장한다(불필요한 재직렬화·버전 방지).
- `safeParse`: 파싱 실패 시 원문을 플레인 문단으로 폴백 — 편집이 막히면 안 된다는 스펙 계약.
- `Markdown.configure({ html: false })` — 생 HTML은 텍스트로 보존(손실 정책). 보기 쪽
  react-markdown의 raw HTML 미렌더와 쌍을 이루는 XSS 정책이다.
- 코드 하이라이팅은 에디터(CodeBlockLowlight/lowlight common)와 보기(rehype-highlight)가
  같은 `hljs-*` 클래스·자동 감지 끔 정책을 공유한다 — 한쪽만 바꾸지 않는다.

## [[위키링크]]

- 패턴 정규식의 단일 원천은 `../lib/wikiLinks.ts`의 `WIKI_LINK_SOURCE` — 새 정규식을 만들지 말 것.
- `parseMarkdown`이 텍스트 노드의 `[[제목]]`을 wikiLink 원자 노드로 승격(코드 블록·인라인 코드 제외,
  기존 마크 유지). 부재 페이지는 `.wiki-chip-missing` 데코레이션.

## 팝업/팝오버

- 자동완성(`WikiLinkSuggestion`)·슬래시 메뉴(`SlashMenu`)는 확장이 `onStateChange`로 상태를
  WikiEditor로 밀어넣고 `SuggestionPopup`이 렌더한다. blur 시 직접 닫는다
  (@tiptap/suggestion은 blur만으로 onExit이 발화하지 않음 — WikiEditor 주석 참조).
- 새 팝오버는 `../lib/useDismissablePopover`(외부 클릭/ESC) +
  `../lib/controlledOpenState`(open/onOpenChange 프롭 쌍 계약)를 재사용한다.

## 알려진 한계·고정 사항

- `tiptap-markdown`은 **0.8.10 고정** — 올리기 전에 왕복 테스트(`markdown.test.ts`) 전체 확인.
- 패널(GitHub alerts)은 저장 시 `\[!NOTE\]`로 이스케이프되어 GitHub 렌더러와 비호환(설계 문서 참조).
- `GlobalDragHandle`의 `scrollTreshold`는 upstream 옵션명 오탈자 그대로다 — 고치지 말 것.
- jsdom 테스트에서 에디터 입력은 `editorTestRegistry`로 commands를 직접 호출한다
  (프로덕션 코드는 레지스트리에 쓰기만 한다).
