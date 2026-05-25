import { describe, expect, test } from "bun:test";

describe("tscn", () => {
  test("has integration fixture", () => {
    expect("hello from tscn").toContain("tscn");
  });
});
