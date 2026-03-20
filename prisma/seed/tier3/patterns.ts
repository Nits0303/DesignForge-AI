import { upsertPattern } from "../helpers";

export async function seedPatternsTier3() {
  const patterns = [
    {
      name: "saas-landing-page-structure",
      platform: "website",
      description:
        "A SaaS landing page that introduces the product, explains key benefits, builds trust, and drives sign-ups. The page opens with a hero section featuring a clear value proposition, short subheadline, prominent primary CTA button, and optional secondary CTA. Immediately below the hero, include a social proof strip of customer logos or metrics. Follow with a feature grid that explains 3–6 core benefits with icons and concise copy. Next, include a deeper explanation section with a product screenshot and supporting text. Add a testimonials or customer stories section to reduce risk and build credibility. Close the page with pricing or a strong CTA section and a footer with navigation, legal links, and contact info. The design mood is confident and modern, with spacious layout and clear hierarchy.",
      industryTags: ["saas", "b2b", "software"],
      sectionOrder: [
        "hero",
        "social-proof",
        "feature-grid",
        "product-explainer",
        "testimonials",
        "pricing-or-cta",
        "footer",
      ],
      styleGuidelines: {
        colorMode: "dark",
        typography: "sans",
        spacing: "spacious",
        notes:
          "Above the fold must communicate value, target audience, and primary CTA. Social proof should appear within the first two scrolls. Use clear visual grouping for benefits vs. proof vs. pricing.",
      },
    },
  ];

  for (const pattern of patterns) {
    try {
      await upsertPattern(pattern as any);
    } catch (err) {
      console.error("Failed to upsert design pattern", pattern.name, err);
    }
  }
}

