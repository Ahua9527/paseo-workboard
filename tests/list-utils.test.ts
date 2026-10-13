import { describe, expect, it } from "vitest";
import {
  cardAnchorAtY,
  contentY,
  groupAtY,
  groupOrderAtY,
  rowBoundsInContent,
  stackedBounds,
} from "../client/list-utils";

describe("list drag geometry", () => {
  const groups = {
    a: { top: 0, height: 100 },
    b: { top: 110, height: 50 },
    c: { top: 170, height: 120 },
  };

  it("uses scroll-content coordinates after scrolling", () => {
    expect(contentY(140, 40, 200)).toBe(300);
    expect(groupAtY(120, ["a", "b", "c"], groups)).toBe("b");
    expect(groupAtY(-1, ["a", "b", "c"], groups)).toBeNull();
    expect(groupAtY(300, ["a", "b", "c"], groups)).toBeNull();
  });

  it("reorders a group around measured group midpoints", () => {
    expect(groupOrderAtY(["a", "b", "c"], "c", 10, groups)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(groupOrderAtY(["a", "b", "c"], "a", 300, groups)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("anchors only to visible task rows, including after the last row", () => {
    const rows = {
      one: { top: 30, height: 40 },
      hidden: { top: 60, height: 20 },
      two: { top: 80, height: 40 },
    };
    expect(cardAnchorAtY(31, "two", ["one", "two"], rows)).toEqual({
      anchor: "one",
      side: "before",
    });
    expect(cardAnchorAtY(150, "one", ["one", "two"], rows)).toEqual({
      anchor: "two",
      side: "after",
    });
    expect(cardAnchorAtY(150, "one", ["one"], rows)).toBeNull();
  });

  it("recomputes row position after its group or quick-create body moves", () => {
    const rows = {
      first: { top: 0, height: 40 },
      second: { top: 40, height: 40 },
    };
    const initial = rowBoundsInContent(["first", "second"], rows, 100, 50);
    expect(cardAnchorAtY(172, "second", ["first", "second"], initial)).toEqual({
      anchor: "first",
      side: "after",
    });
    const moved = rowBoundsInContent(["first", "second"], rows, 220, 90);
    expect(cardAnchorAtY(172, "second", ["first", "second"], moved)).toEqual({
      anchor: "first",
      side: "before",
    });
  });

  it("accepts a collapsed or empty group header as a drop target", () => {
    expect(groupAtY(130, ["a", "b", "c"], groups)).toBe("b");
    expect(groupAtY(175, ["a", "b", "c"], groups)).toBe("c");
  });

  it("rebuilds group targets after a prior group collapses without new position callbacks", () => {
    const recorded = {
      inbox: { top: 12, height: 240 },
      todo: { top: 262, height: 180 },
      review: { top: 452, height: 46 },
    };
    const before = stackedBounds(["inbox", "todo", "review"], recorded, 12, 10);
    expect(groupAtY(475, ["inbox", "todo", "review"], before)).toBe("review");
    recorded.inbox.height = 46;
    recorded.todo.height = 46;
    const after = stackedBounds(["inbox", "todo", "review"], recorded, 12, 10);
    expect(after.review.top).toBe(124);
    expect(groupAtY(145, ["inbox", "todo", "review"], after)).toBe("review");
  });

  it("anchors by current visible order and quick-create height after a reorder", () => {
    const measured = {
      a: { top: 38, height: 40 },
      b: { top: 78, height: 60 },
      c: { top: 138, height: 50 },
    };
    const before = rowBoundsInContent(["a", "b", "c"], measured, 200, 46, 38);
    expect(cardAnchorAtY(340, "a", ["a", "b", "c"], before)).toEqual({
      anchor: "b",
      side: "before",
    });
    const reordered = rowBoundsInContent(
      ["b", "c", "a"],
      measured,
      200,
      46,
      58,
    );
    expect(reordered.b.top).toBe(304);
    expect(reordered.a.top).toBe(414);
    expect(cardAnchorAtY(340, "a", ["b", "c", "a"], reordered)).toEqual({
      anchor: "c",
      side: "before",
    });
  });
});
