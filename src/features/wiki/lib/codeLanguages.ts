import { common } from "lowlight";

/**
 * 코드 블록 언어 목록의 **단일 원천**(기획 P6).
 *
 * 예전엔 `CodeBlockView`에 15개를 손으로 박아뒀는데, 그 목록이 실제 하이라이터 등록 집합과
 * 달랐다 — 목록에 있는 언어를 골라도 강조가 안 되거나(등록 안 됨), 강조되는 언어가 목록에
 * 없어서 못 고르는 상태였다. 그래서 lowlight `common`에서 직접 파생시킨다.
 *
 * 편집(lowlight)과 보기(rehype-highlight)가 **각각** 등록하는 구조인데, 둘 다 `common`을
 * 기본으로 쓰므로 이 목록이 양쪽과 일치한다. 전체 192종으로 넓히려면 두 경로의 레지스트리를
 * **함께** 바꿔야 한다 — 한쪽만 넓히면 "고를 수는 있는데 강조가 안 되는" 상태로 돌아간다.
 */
export const CODE_LANGUAGES: string[] = [
  // 언어 미지정 — lowlight에 등록돼 있지만 contains 규칙이 없어 토큰이 생기지 않는다(무하이라이트)
  "plaintext",
  ...Object.keys(common).sort((a, b) => a.localeCompare(b)),
];
