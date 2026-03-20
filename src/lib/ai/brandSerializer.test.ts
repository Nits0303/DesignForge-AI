import { describe, expect, test } from "vitest";
import { brandProfileToXml } from "@/lib/ai/brandSerializer";

describe("brandProfileToXml", () => {
  test("serializes full brand profile", () => {
    const xml = brandProfileToXml({
      id: "b1",
      name: "Acme",
      industry: "SaaS",
      toneVoice: "Bold & modern",
      isDefault: true,
      logoPrimaryUrl: "/api/files/uploads/u/brand/logo.png",
      colors: {
        primary: "#112233",
        secondary: "#223344",
        accent: "#334455",
        background: "#0f172a",
        text: "#f8fafc",
      },
      typography: {
        headingFont: "Inter",
        bodyFont: "Inter",
        headingWeight: 700,
        bodyWeight: 400,
      },
    });

    expect(xml).toContain("<brand_profile>");
    expect(xml).toContain("<name>Acme</name>");
    expect(xml).toContain("<colors>");
    expect(xml).toContain("<primary>#112233</primary>");
    expect(xml).toContain("<typography>");
    expect(xml).toContain("<tone>Bold &amp; modern</tone>");
    expect(xml).toContain("<logo_url>/api/files/uploads/u/brand/logo.png</logo_url>");
  });

  test("omits optional tags when missing", () => {
    const xml = brandProfileToXml({
      id: "b1",
      name: "Acme",
      isDefault: false,
    });
    expect(xml).toContain("<name>Acme</name>");
    expect(xml).not.toContain("<tone>");
    expect(xml).not.toContain("<industry>");
    expect(xml).not.toContain("<logo_url>");
    expect(xml).not.toContain("<colors>");
  });

  test("escapes special characters", () => {
    const xml = brandProfileToXml({
      id: "b1",
      name: "A&B <Brand>",
      toneVoice: `Use "quotes" & <tags>`,
      isDefault: false,
    });
    expect(xml).toContain("<name>A&amp;B &lt;Brand&gt;</name>");
    expect(xml).toContain("<tone>Use &quot;quotes&quot; &amp; &lt;tags&gt;</tone>");
  });
});

