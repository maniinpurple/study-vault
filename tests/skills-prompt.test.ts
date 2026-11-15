import { describe, expect, it } from "vitest";

import { analyzeOutputSchema, analyzeRequestSchema, buildAnalyzePrompt, buildClassifyPrompt, classifyOutputSchema, classifyRequestSchema, matchSubject } from "@/lib/skills-prompt";

const image = { mimeType: "image/jpeg" as const, data: "AAAA" };

describe("classifier skill", () => {
  it("asks for JSON only and offers the student's own subjects", () => {
    const { system, prompt } = buildClassifyPrompt(classifyRequestSchema.parse({ image, subjects: ["Toán 12", "Vật Lý"] }));
    expect(system).toContain("You are a document classifier");
    expect(system).toContain("valid JSON");
    expect(prompt).toContain('"Toán 12"');
    expect(buildClassifyPrompt(classifyRequestSchema.parse({ image })).prompt).not.toContain("already has");
  });
  it("accepts a title and subject, trimmed, and rejects empty ones", () => {
    expect(classifyOutputSchema.parse({ title: "  Đề thi thử  ", subject: " Toán " })).toEqual({ title: "Đề thi thử", subject: "Toán" });
    expect(classifyOutputSchema.safeParse({ title: "", subject: "Toán" }).success).toBe(false);
    expect(classifyOutputSchema.safeParse({ title: "x" }).success).toBe(false);
  });
});

describe("problem analysis skill", () => {
  it("needs a question or an image", () => {
    expect(analyzeRequestSchema.safeParse({}).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ questionLatex: "  " }).success).toBe(false);
    expect(analyzeRequestSchema.safeParse({ questionLatex: "$x^2=4$" }).success).toBe(true);
    expect(analyzeRequestSchema.safeParse({ image }).success).toBe(true);
  });
  it("builds a prompt from text, or points at the image", () => {
    expect(buildAnalyzePrompt({ subjectName: "Toán", questionLatex: "Tính $\\int x\\,dx$" }).prompt).toContain("Tính $\\int x\\,dx$");
    expect(buildAnalyzePrompt({ image }).prompt).toContain("attached image");
    expect(buildAnalyzePrompt({ image }).system).toContain("core_concept");
  });
  it("accepts the { type, core_concept } contract", () => {
    expect(analyzeOutputSchema.parse({ type: "Tích phân từng phần", core_concept: "$\\int u\\,dv = uv - \\int v\\,du$" })).toMatchObject({ type: "Tích phân từng phần" });
    expect(analyzeOutputSchema.safeParse({ type: "x" }).success).toBe(false);
  });
});

describe("matchSubject", () => {
  const subjects = [{ name: "Toán TSA" }, { name: "Vật Lý" }, { name: "IELTS / Tiếng Anh" }];
  it("ignores case and diacritics", () => {
    expect(matchSubject(subjects, "vat ly")).toBe(subjects[1]);
    expect(matchSubject(subjects, "VẬT LÝ")).toBe(subjects[1]);
  });
  it("matches when one name contains the other", () => {
    expect(matchSubject(subjects, "Toán")).toBe(subjects[0]);
    expect(matchSubject(subjects, "Tiếng Anh")).toBe(subjects[2]);
  });
  it("returns null when nothing fits", () => {
    expect(matchSubject(subjects, "Hoá học")).toBeNull();
    expect(matchSubject(subjects, "")).toBeNull();
    expect(matchSubject([], "Toán")).toBeNull();
  });
});
