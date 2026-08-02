/**
 * 열 수를 그대로 그리는 슬래시 메뉴 아이콘.
 *
 * lucide에는 `Columns2`~`Columns4`만 있고 5열이 없다. 4·5를 같은 아이콘으로 두면
 * 레퍼런스(`레이아웃.png`)에서 아이콘이 열 수를 구분해주는 요점이 사라진다 —
 * 목록에서 "몇 열짜리인지"를 아이콘으로 먼저 읽게 하는 게 이 메뉴의 설계다.
 *
 * lucide 아이콘과 같은 24 viewBox·1.5 스트로크·`currentColor`를 써서 나란히 놓았을 때
 * 굵기와 색이 어긋나지 않는다.
 */
export interface ColumnLayoutIconProps {
  size?: number;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

/** N열을 그리는 아이콘 컴포넌트를 만든다(모듈 로드 시 1~5개를 미리 만들어 둔다). */
export function createColumnLayoutIcon(count: number) {
  const GAP = 1.5;
  const OUTER = 3; // 좌우 여백
  const total = 24 - OUTER * 2;
  const width = (total - GAP * (count - 1)) / count;

  function ColumnLayoutIcon({ size = 24, className, ...rest }: ColumnLayoutIconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...rest}
      >
        {Array.from({ length: count }, (_, i) => (
          <rect
            key={i}
            x={OUTER + i * (width + GAP)}
            y={4}
            width={width}
            height={16}
            rx={1}
          />
        ))}
      </svg>
    );
  }
  ColumnLayoutIcon.displayName = `ColumnLayoutIcon${count}`;
  return ColumnLayoutIcon;
}

/** 1~5열 아이콘 — 인덱스가 아니라 열 수로 찾는다. */
export const COLUMN_LAYOUT_ICONS: Record<number, ReturnType<typeof createColumnLayoutIcon>> = {
  1: createColumnLayoutIcon(1),
  2: createColumnLayoutIcon(2),
  3: createColumnLayoutIcon(3),
  4: createColumnLayoutIcon(4),
  5: createColumnLayoutIcon(5),
};
