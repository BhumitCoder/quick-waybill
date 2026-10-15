import { describe, it, expect } from "vitest";
import { visibleRange } from "./visibleRange";

describe("visibleRange", () => {
  it("covers the viewport plus overscan at the top of the list", () => {
    expect(visibleRange(0, 560, 56, 5000, 6)).toEqual({ start: 0, end: 16 });
  });

  it("follows the scroll position deep into a long list", () => {
    const { start, end } = visibleRange(56 * 3000, 560, 56, 5000, 6);
    expect(start).toBe(2994);
    expect(end).toBe(3016);
  });

  it("never goes past the end of the list", () => {
    expect(visibleRange(56 * 4995, 560, 56, 5000, 6)).toEqual({ start: 4989, end: 5000 });
  });

  it("renders a short list completely", () => {
    expect(visibleRange(0, 560, 56, 3, 6)).toEqual({ start: 0, end: 3 });
  });

  it("handles an empty list and odd inputs", () => {
    expect(visibleRange(0, 560, 56, 0, 6)).toEqual({ start: 0, end: 0 });
    expect(visibleRange(-40, 560, 56, 100, 6)).toEqual({ start: 0, end: 16 });
  });
});
