import type { MouseEvent } from "react";

/**
 * 실제로 넘칠 때만 `title`을 채운다.
 *
 * 항상 title을 달면 짧은 이름에도 툴팁이 떠서 소음이 된다 — 컨플루언스 트리도 넘치는 항목만
 * title을 갖는다. 넘침 판정은 hover 시점에 한다: 폭은 사이드바 리사이즈·창 크기로 계속 변하고,
 * 렌더 시점에 재면 그때마다 레이아웃을 강제로 계산해야 한다.
 *
 * 전체 텍스트는 DOM에 그대로 남으므로(잘리는 건 시각 표현뿐) 스크린리더는 원래 이름을 읽는다.
 * 그래서 DS `Tooltip`(포커스 가능한 트리거 전용)을 쓰지 않고 네이티브 title로 충분하다.
 */
export function applyOverflowTitle(el: HTMLElement, text: string): void {
  if (el.scrollWidth > el.clientWidth) {
    if (el.title !== text) el.title = text;
  } else if (el.hasAttribute("title")) {
    el.removeAttribute("title");
  }
}

/**
 * 이미 말줄임 CSS를 가진 요소(버튼·링크 등 감쌀 수 없는 자리)에 그대로 펼쳐 넣는 props.
 * 훅이 아니므로 `.map()` 안에서도 쓸 수 있다.
 */
export function overflowTitleProps(text: string): {
  onMouseEnter: (event: MouseEvent<HTMLElement>) => void;
} {
  return {
    onMouseEnter: (event: MouseEvent<HTMLElement>) => applyOverflowTitle(event.currentTarget, text),
  };
}

export interface TruncatedTextProps {
  /** 화면에 그리는 값이자, 넘칠 때 툴팁으로 보여 줄 전체 값 */
  text: string;
  /** 자리별 클래스(레이아웃·색). `.wiki-truncate`(말줄임)와 함께 붙는다. */
  className?: string;
}

/** 한 줄 말줄임 + (넘칠 때만) 전체 이름 툴팁. 이름을 보여 주는 모든 자리가 이 컴포넌트를 쓴다. */
export function TruncatedText({ text, className }: TruncatedTextProps) {
  return (
    <span
      className={className ? `wiki-truncate ${className}` : "wiki-truncate"}
      onMouseEnter={(event) => applyOverflowTitle(event.currentTarget, text)}
    >
      {text}
    </span>
  );
}
