// 백엔드 어댑터 공용 — 응답 파싱과 4xx/5xx의 한국어 오류 변환.
import { extractError } from "../mapping";

/** 백엔드 응답(JSON) 파싱 + 4xx/5xx를 한국어 에러로 변환. 이후 태스크(pages/versions/attachments)도 재사용. */
export async function json<T>(res: Response): Promise<T> {
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(extractError(res.status, body));
  return body as T;
}
