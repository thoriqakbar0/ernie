import { describe, expect, it } from "vitest";
import { parseNamedFileOutput } from "../src/renderer/src/execution-output";

describe("parseNamedFileOutput", () => {
  it("splits blank-line-separated code excerpts into named language blocks", () => {
    const result = parseNamedFileOutput(`
 provider_openai.go
func streamOpenAI() {}

 provider_google.go
func streamGoogle() {}
`);

    expect(result).toEqual({
      prelude: "",
      files: [
        { name: "provider_openai.go", language: "Go", content: "func streamOpenAI() {}" },
        { name: "provider_google.go", language: "Go", content: "func streamGoogle() {}" },
      ],
    });
  });

  it("keeps ambiguous and ordinary output on the plain-text path", () => {
    expect(parseNamedFileOutput("report.go\none unstructured value")).toBeNull();
    expect(parseNamedFileOutput("version 1.2.3\ncompleted")).toBeNull();
  });
});
