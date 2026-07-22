/**
 * 사용자 표시 이름 폴백. 백엔드 모드에선 wiki-backend가 사용자 이름을 주지 않아(숫자 id만)
 * 이름을 못 찾을 때 `사용자 #{id}`로 표기한다(설계 §4-1). 목업 모드는 실제 이름을 쓰므로 미사용.
 */
export function displayUserName(id: string): string {
  return `사용자 #${id}`;
}
