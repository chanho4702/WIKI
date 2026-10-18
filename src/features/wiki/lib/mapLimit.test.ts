import { describe, expect, it } from "vitest";
import { mapLimit } from "./mapLimit";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("mapLimit", () => {
  it("동시에 limit개를 넘겨 실행하지 않고, 결과는 입력 순서를 지킨다", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      for (let i = 0; i < n; i++) await tick();
      running--;
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([50, 10, 40, 20, 30, 60, 70]);
  });

  it("실패하면 첫 오류로 거부하고 남은 항목은 새로 시작하지 않는다", async () => {
    const started: number[] = [];
    await expect(
      mapLimit([1, 2, 3, 4, 5], 1, async (n) => {
        started.push(n);
        if (n === 2) throw new Error("실패");
        return n;
      }),
    ).rejects.toThrow("실패");
    expect(started).toEqual([1, 2]);
  });

  it("빈 입력은 빈 배열", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
  });
});
