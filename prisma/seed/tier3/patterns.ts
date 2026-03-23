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
    {
      name: "mobile-onboarding-flow",
      platform: "mobile",
      description:
        "Standard onboarding: welcome hero with two CTAs, 2–3 feature highlights with progress dots, optional permissions, account creation. Skippable after first screen; final CTA should be action-oriented.",
      industryTags: ["mobile", "onboarding"],
      sectionOrder: ["welcome", "feature", "feature", "permissions", "account"],
      styleGuidelines: {
        colorMode: "dark",
        typography: "sans",
        spacing: "comfortable",
        notes: "Keep visual language consistent across all screens; reuse nav + tab chrome.",
      },
    },
    {
      name: "mobile-auth-flow",
      platform: "mobile",
      description:
        "Sign in / sign up with social options above email, forgot password on separate stack screen, inline validation errors.",
      industryTags: ["mobile", "auth"],
      sectionOrder: ["sign_in", "sign_up", "forgot_password"],
      styleGuidelines: {
        colorMode: "dark",
        typography: "sans",
        spacing: "comfortable",
        notes: "Use platform-appropriate text fields and spacing.",
      },
    },
    {
      name: "mobile-ecommerce-product-flow",
      platform: "mobile",
      description:
        "Browse → product detail with sticky add-to-cart → checkout steps → confirmation with order summary.",
      industryTags: ["mobile", "ecommerce"],
      sectionOrder: ["product_detail", "cart", "shipping", "payment", "confirmation"],
      styleGuidelines: {
        colorMode: "dark",
        typography: "sans",
        spacing: "dense",
        notes: "Price and primary CTA must remain visible on product detail.",
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

