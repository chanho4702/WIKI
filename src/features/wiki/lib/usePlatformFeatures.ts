import { useEffect, useState } from "react";
import { getPlatformFeatures, LITE_FEATURES, type PlatformFeatures } from "../store/platformApi";

/**
 * 플랫폼 설치 옵션(`/api/platform/features`)을 읽는다 — 조회는 세션 1회이므로 이 훅을 여러
 * 화면에서 불러도 요청은 한 번이다.
 *
 * `null`은 **아직 모른다**는 뜻이다. 화면은 그동안 능력을 켜지 말아야 한다 — 켜 두면 라이트
 * 설치에서 관리 메뉴가 한 번 깜빡이고 사라진다.
 */
export function usePlatformFeatures(): PlatformFeatures | null {
  const [features, setFeatures] = useState<PlatformFeatures | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPlatformFeatures()
      // 조회는 스스로 라이트로 접히므로 여기까지 오지 않는다 — 그래도 한 겹 더 접는다:
      // 예기치 못한 실패가 화면을 "영원히 로딩 중"으로 남겨 두는 편이 더 나쁘다.
      .catch(() => LITE_FEATURES)
      .then((next) => {
        if (!cancelled) setFeatures(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return features;
}
