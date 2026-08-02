import { useCallback, useEffect, useState } from "react";

/**
 * 코드 블록 표시 설정 — **문서가 아니라 보는 사람에게 붙는다**(기획 P1).
 *
 * 컨플루언스는 이걸 페이지에 저장하지만 우리는 그럴 수 없다. `Page.body`는 마크다운 문자열이고
 * (CLAUDE.md 불변조건 2), 코드펜스 meta(``` ```ts wrap ```)에 실으면 GitHub 등 표준 렌더러에서
 * 언어가 `ts wrap`으로 읽혀 강조가 깨진다 — 패널의 `\[!NOTE\]` 이스케이프와 같은 부류의 대가다.
 * 버전 diff에도 표시 설정 변경이 내용 변경으로 섞여 들어간다.
 *
 * 그래서 localStorage 전역 설정으로 둔다. 도메인 데이터가 아니므로 store 계약(wikiStore)을
 * 확장하지 않는다 — `lib/*` 프리퍼런스 모듈이 담당한다는 기존 규약(pageWidth·sidebarPrefs) 그대로.
 *
 * ## 줄 번호와 줄바꿈은 함께 켤 수 없다
 *
 * 줄 번호는 `white-space: pre`에서 한 줄이 정확히 한 행일 때만 정렬이 맞는다. 줄바꿈을 켜면
 * 긴 줄이 여러 행으로 접히면서 번호가 실제 줄과 어긋난다 — **어긋난 번호는 없는 것보다 나쁘다**
 * (리뷰에서 "12번째 줄"을 가리켰는데 다른 줄을 보게 된다). 그래서 줄바꿈이 켜지면 번호를 숨긴다.
 */
export interface CodeBlockPrefs {
  /** 줄 번호 표시. 기본 켬 — 캡처(`기능들.png`)의 기본 상태다. */
  lineNumbers: boolean;
  /** 긴 줄 접기. 기본 끔. 켜면 줄 번호는 숨겨진다(위 주석). */
  wrap: boolean;
}

export const DEFAULT_CODE_BLOCK_PREFS: CodeBlockPrefs = { lineNumbers: true, wrap: false };

const STORAGE_KEY = "wiki.ui.codeBlock";

/** 줄 번호를 실제로 그릴지 — 줄바꿈이 켜져 있으면 정렬이 깨지므로 그리지 않는다. */
export function showsLineNumbers(prefs: CodeBlockPrefs): boolean {
  return prefs.lineNumbers && !prefs.wrap;
}

export function getCodeBlockPrefs(): CodeBlockPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CODE_BLOCK_PREFS;
    const parsed = JSON.parse(raw) as Partial<CodeBlockPrefs>;
    return {
      lineNumbers: typeof parsed.lineNumbers === "boolean" ? parsed.lineNumbers : true,
      wrap: typeof parsed.wrap === "boolean" ? parsed.wrap : false,
    };
  } catch {
    // 접근 차단(시크릿 모드)·깨진 JSON — 기본값으로 대체한다
    return DEFAULT_CODE_BLOCK_PREFS;
  }
}

export function setCodeBlockPrefs(prefs: CodeBlockPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 저장 실패 — 조용히 무시. 화면 상태는 세션 내에서 유지된다.
  }
}

/** 같은 화면에 코드 블록이 여러 개다 — 하나를 토글하면 나머지도 함께 바뀌어야 한다. */
const CHANGE_EVENT = "wiki:codeblock-prefs";

export function useCodeBlockPrefs(): {
  prefs: CodeBlockPrefs;
  toggle: (key: keyof CodeBlockPrefs) => void;
} {
  const [prefs, setPrefs] = useState<CodeBlockPrefs>(getCodeBlockPrefs);

  useEffect(() => {
    const sync = () => setPrefs(getCodeBlockPrefs());
    window.addEventListener(CHANGE_EVENT, sync);
    // 다른 탭에서 바꾼 경우
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const toggle = useCallback((key: keyof CodeBlockPrefs) => {
    const next = { ...getCodeBlockPrefs() };
    next[key] = !next[key];
    setCodeBlockPrefs(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { prefs, toggle };
}

/** 코드 문자열의 논리적 줄 수 — 끝의 개행 하나는 세지 않는다(마지막 빈 줄에 번호가 붙지 않게). */
export function countLines(code: string): number {
  const trimmed = code.endsWith("\n") ? code.slice(0, -1) : code;
  if (trimmed === "") return 1;
  return trimmed.split("\n").length;
}
