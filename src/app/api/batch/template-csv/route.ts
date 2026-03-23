import { NextResponse } from "next/server";

function csvTemplate() {
  // Comment/help lines must start with "#".
  return [
    "# topic/title: Content topic for this design (required)",
    "# date: Scheduled date (YYYY-MM-DD or a human format like March 15 / next Monday) (required)",
    "# platform: One of instagram, linkedin, facebook, twitter, website, mobile, dashboard (required)",
    "# format: Platform-specific format (optional; defaults to the platform’s most common format)",
    "# notes: Extra context (optional)",
    "# reference_url/reference_image: Optional URL for a reference image (optional)",
    "topic,date,platform,format,notes,reference_url",
    "Monday motivation post,2026-03-02,instagram,post,Bold hook + minimal copy,https://example.com/reference1.jpg",
    "Q1 results announcement,2026-03-10,linkedin,post,Highlight key metrics as bullets,https://example.com/reference2.jpg",
    "Product launch hero,2026-03-15,website,hero_section,Use a strong headline and one CTA button,https://example.com/reference3.jpg",
    "Carousel productivity tips,2026-03-22,instagram,story,Make it a 3-slide story-like layout,",
    "Company milestone banner,2026-03-28,twitter,banner,Short text + brand-aligned colors,https://example.com/reference5.jpg",
  ].join("\n");
}

export const runtime = "nodejs";

export async function GET() {
  const body = csvTemplate();
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="batch_template.csv"',
    },
  });
}

