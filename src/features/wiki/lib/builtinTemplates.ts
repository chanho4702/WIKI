import type { PageTemplate } from "../store/types";

/**
 * 기본 템플릿 갤러리(W27-1).
 *
 * 코드에 두고 읽기 전용으로 쓴다 — DB 시드가 아니다. 스페이스마다 열 개씩 복제해 넣으면 고친 뒤
 * 원본이 무엇이었는지 알 수 없고, 전역 템플릿 테이블은 관리 주체가 모호하다(V19 주석).
 * 고치고 싶으면 설정에서 스페이스 템플릿으로 복사한다 — 그때부터는 그 스페이스의 자산이다.
 *
 * 본문은 이 리포가 실제로 렌더하는 문법만 쓴다: 제목·목록·표·체크박스(GFM), `:::properties`
 * 속성 표, `:status[…]{.info}` 배지, `> [!NOTE]` 패널, `:::details[제목]` 토글, `::toc`.
 * 편집기(tiptap-markdown)는 지시자를 모르지만 텍스트로 보존하고 이스케이프만 덧붙인다 —
 * 보기 렌더러가 그 이스케이프까지 읽으므로 왕복해도 의미가 남는다(builtinTemplates.test.ts).
 *
 * 변수(`{{date}}`·`{{author}}`·`{{space}}`)는 만들 때 한 번 치환된다(templateVariables.ts).
 * 제목은 변수로 두지 않는다 — 만드는 시점의 제목은 언제나 "제목 없음"이라 넣을 값이 없다.
 */
export interface BuiltinTemplate {
  /** `builtin:` 접두어로 스페이스 템플릿 id(숫자 문자열)와 겹치지 않게 한다. */
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
}

export const BUILTIN_TEMPLATE_ID_PREFIX = "builtin:";

export function isBuiltinTemplateId(id: string): boolean {
  return id.startsWith(BUILTIN_TEMPLATE_ID_PREFIX);
}

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    id: "builtin:meeting-notes",
    name: "회의록",
    description: "회의의 안건과 결정, 후속 작업을 한 장에 남긴다.",
    icon: "📝",
    content: `:::properties

| 항목 | 값 |
| --- | --- |
| 날짜 | {{date}} |
| 작성자 | {{author}} |
| 스페이스 | {{space}} |
| 상태 | :status[진행 중]{.info} |

:::

## 참석자

- {{author}}
- 참석자 이름

## 안건

1. 첫 번째 안건
2. 두 번째 안건

## 논의 내용

안건별로 오간 이야기를 적는다.

## 결정 사항

| 결정 | 근거 | 결정자 |
| --- | --- | --- |
| 무엇을 하기로 했는가 | 왜 그렇게 정했는가 | 누가 정했는가 |

## 후속 작업

- [ ] 할 일 — 담당자 / 기한

> [!NOTE] 회의가 끝나기 전에 후속 작업의 담당자와 기한을 채운다.
`,
  },
  {
    id: "builtin:decision-record",
    name: "결정 기록(ADR)",
    description: "무엇을 왜 그렇게 정했는지, 되돌리는 값은 얼마인지 남긴다.",
    icon: "🧭",
    content: `:::properties

| 항목 | 값 |
| --- | --- |
| 결정일 | {{date}} |
| 작성자 | {{author}} |
| 상태 | :status[검토 중]{.warning} |

:::

## 배경

어떤 상황이라 결정이 필요해졌는지 적는다.

## 검토한 선택지

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| 안 1 | 무엇이 좋은가 | 무엇을 포기하는가 |
| 안 2 | 무엇이 좋은가 | 무엇을 포기하는가 |

## 결정

무엇으로 정했는지 한 문장으로 적는다.

## 근거

- 이 선택지를 고른 이유
- 다른 안을 접은 이유

## 영향

- 이 결정으로 바뀌는 것
- 되돌리려면 치러야 할 비용

> [!WARNING] 결정을 뒤집을 때는 이 문서를 고치지 않는다. 새 결정 기록을 쓰고 여기서 링크한다.
`,
  },
  {
    id: "builtin:prd",
    name: "제품 요구사항(PRD)",
    description: "무엇을 왜 만드는지, 어디까지 만드는지 합의한다.",
    icon: "📋",
    content: `::toc

:::properties

| 항목 | 값 |
| --- | --- |
| 작성일 | {{date}} |
| 작성자 | {{author}} |
| 상태 | :status[초안]{.neutral} |

:::

## 문제

지금 무엇이 불편한가. 누가 겪는가.

## 목표

- 이 문서가 끝났을 때 달성되는 것

## 범위 밖

- 이번에 하지 않는 것과 그 이유

## 사용자 시나리오

1. 사용자가 무엇을 한다
2. 시스템이 무엇으로 답한다

## 요구사항

| 번호 | 요구사항 | 우선순위 |
| --- | --- | --- |
| R1 | 반드시 되어야 하는 것 | 필수 |
| R2 | 되면 좋은 것 | 선택 |

## 수용 기준

- [ ] 확인할 수 있는 문장으로 적는다

:::details[열린 질문]

아직 정하지 못한 것을 여기 모아 두고, 정해지면 위 본문으로 옮긴다.

:::
`,
  },
  {
    id: "builtin:retrospective",
    name: "회고",
    description: "잘된 것·아쉬운 것·다음에 바꿀 것을 정리한다.",
    icon: "🔁",
    content: `:::properties

| 항목 | 값 |
| --- | --- |
| 회고일 | {{date}} |
| 진행자 | {{author}} |
| 대상 기간 | 시작일부터 종료일까지 |

:::

## 잘된 것

- 계속 하고 싶은 것

## 아쉬운 것

- 다시 겪고 싶지 않은 것

## 시도해 볼 것

| 실험 | 담당자 | 확인 시점 |
| --- | --- | --- |
| 무엇을 바꿔 볼 것인가 | 누가 | 다음 회고 |

## 실행 항목

- [ ] 다음 회고 전까지 끝낼 일 — 담당자 / 기한

> [!TIP] 사람이 아니라 일하는 방식을 이야기한다.
`,
  },
  {
    id: "builtin:project-plan",
    name: "프로젝트 계획(킥오프)",
    description: "목표·범위·일정·역할을 킥오프에서 합의한다.",
    icon: "🚀",
    content: `::toc

:::properties

| 항목 | 값 |
| --- | --- |
| 시작일 | {{date}} |
| 책임자 | {{author}} |
| 스페이스 | {{space}} |
| 상태 | :status[준비 중]{.info} |

:::

## 목표

이 프로젝트가 끝나면 무엇이 달라지는가.

## 범위

- 하는 것
- 하지 않는 것

## 일정

| 단계 | 산출물 | 기한 |
| --- | --- | --- |
| 설계 | 설계 문서 | 연-월-일 |
| 구현 | 동작하는 기능 | 연-월-일 |
| 검증 | 테스트 결과 | 연-월-일 |

## 역할

| 역할 | 담당자 |
| --- | --- |
| 책임자 | {{author}} |
| 개발 | 이름 |
| 검증 | 이름 |

## 위험

| 위험 | 영향 | 대응 |
| --- | --- | --- |
| 무엇이 어긋날 수 있는가 | 어디까지 번지는가 | 무엇으로 막는가 |

## 준비 항목

- [ ] 킥오프 전에 끝내야 할 일
`,
  },
  {
    id: "builtin:weekly-status",
    name: "주간 상태 보고",
    description: "이번 주 진행·다음 주 계획·막힌 것을 한 장으로.",
    icon: "📈",
    content: `:::properties

| 항목 | 값 |
| --- | --- |
| 보고일 | {{date}} |
| 보고자 | {{author}} |
| 상태 | :status[정상]{.success} |

:::

## 요약

한 문단으로 이번 주를 요약한다.

## 이번 주 한 일

- 끝낸 일

## 다음 주 할 일

- [ ] 하기로 한 일

## 막힌 것

| 막힌 것 | 필요한 도움 | 기한 |
| --- | --- | --- |
| 무엇이 멈춰 있는가 | 누구의 무엇이 필요한가 | 연-월-일 |

## 지표

| 지표 | 지난주 | 이번 주 |
| --- | --- | --- |
| 무엇을 세는가 | 값 | 값 |
`,
  },
  {
    id: "builtin:how-to",
    name: "방법 문서(How-to)",
    description: "따라 하면 끝나는 절차를 순서대로 적는다.",
    icon: "🔧",
    content: `::toc

:::properties

| 항목 | 값 |
| --- | --- |
| 최종 확인 | {{date}} |
| 관리자 | {{author}} |

:::

## 이 문서로 할 수 있는 것

한 문장으로 결과를 적는다.

## 미리 준비할 것

- [ ] 필요한 권한
- [ ] 필요한 도구

## 절차

1. 첫 단계
2. 두 번째 단계
3. 마지막 단계

> [!WARNING] 되돌릴 수 없는 단계는 여기에 따로 적는다.

## 확인

- [ ] 이렇게 되면 성공이다

:::details[자주 겪는 문제]

증상과 해결을 한 줄씩 적는다.

:::
`,
  },
  {
    id: "builtin:troubleshooting",
    name: "문제 해결(트러블슈팅)",
    description: "장애의 증상·원인·조치·재발 방지를 남긴다.",
    icon: "🧯",
    content: `:::properties

| 항목 | 값 |
| --- | --- |
| 발생일 | {{date}} |
| 기록자 | {{author}} |
| 심각도 | :status[높음]{.danger} |
| 상태 | :status[조사 중]{.warning} |

:::

## 증상

무엇이 어떻게 보였는가. 누가 언제 발견했는가.

## 영향

- 영향받은 사용자와 기능
- 지속 시간

## 시간 순서

| 시각 | 일어난 일 |
| --- | --- |
| 00:00 | 무엇이 일어났는가 |

## 원인

확인된 것만 적는다. 추정은 추정이라고 쓴다.

## 조치

1. 즉시 한 일
2. 되돌린 일

## 재발 방지

- [ ] 무엇을 바꾸는가 — 담당자 / 기한

> [!NOTE] 원인을 찾지 못한 채 닫지 않는다. 못 찾았으면 못 찾았다고 적는다.
`,
  },
  {
    id: "builtin:onboarding",
    name: "온보딩 체크리스트",
    description: "새로 합류한 사람이 첫날·첫 주·첫 달에 할 일.",
    icon: "🎒",
    content: `:::properties

| 항목 | 값 |
| --- | --- |
| 합류일 | {{date}} |
| 안내자 | {{author}} |
| 스페이스 | {{space}} |

:::

## 첫날

- [ ] 계정과 권한 받기
- [ ] 팀 소개 받기
- [ ] 이 스페이스 둘러보기

## 첫 주

- [ ] 개발 환경 세팅하기
- [ ] 첫 작업 하나 끝내기
- [ ] 안내자와 1:1 하기

## 첫 달

- [ ] 담당 영역 정하기
- [ ] 온보딩에서 막혔던 곳을 이 문서에 반영하기

## 먼저 읽을 문서

| 문서 | 왜 보는가 |
| --- | --- |
| 문서 이름 | 무엇을 알게 되는가 |

> [!TIP] 막히면 30분 안에 물어본다. 혼자 오래 붙잡는 것이 가장 비싸다.
`,
  },
  {
    id: "builtin:one-on-one",
    name: "1:1 회의",
    description: "정기 1:1의 이야깃거리와 약속을 이어서 기록한다.",
    icon: "🤝",
    content: `:::properties

| 항목 | 값 |
| --- | --- |
| 날짜 | {{date}} |
| 참여자 | {{author}} |

:::

## 지난번 약속

- [ ] 지난 1:1에서 하기로 한 일

## 요즘 어떤가

잘 되는 것과 막히는 것을 적는다.

## 이야기하고 싶은 것

1. 첫 번째
2. 두 번째

## 피드백

| 방향 | 내용 |
| --- | --- |
| 주는 피드백 | 무엇이 도움이 되었는가 |
| 받는 피드백 | 무엇을 바꾸면 좋겠는가 |

## 다음까지 할 일

- [ ] 무엇을 하는가 — 담당자 / 기한

:::details[다음에 이야기할 것]

이번에 다 못한 이야기를 적어 둔다.

:::
`,
  },
];

/**
 * 고르는 화면이 스페이스 템플릿과 같은 흐름을 타도록 `PageTemplate` 모양으로 맞춘다.
 * 서버 원장에 없는 항목이라 `updatedAt`은 null이다("한 번도 고쳐지지 않았다"가 아니라 "없다").
 */
export function builtinTemplatesFor(spaceId: string): PageTemplate[] {
  return BUILTIN_TEMPLATES.map((template) => ({
    id: template.id,
    spaceId,
    name: template.name,
    description: template.description,
    icon: template.icon,
    content: template.content,
    updatedAt: null,
  }));
}
