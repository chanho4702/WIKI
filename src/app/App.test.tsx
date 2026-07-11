import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { App } from "./App";

it("앱 셸 자리표시가 렌더된다", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "WIKI" })).toBeInTheDocument();
});
