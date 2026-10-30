import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
  it("keeps commas inside quotes and reads doubled quotes", () => {
    expect(parseCsv('A,B\n"SMITH, JO","($1,234.56)"\n"say ""hi""",x\n')).toEqual([
      ["A", "B"],
      ["SMITH, JO", "($1,234.56)"],
      ['say "hi"', "x"]
    ]);
  });
});
