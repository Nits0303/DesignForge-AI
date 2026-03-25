/* eslint-disable no-console */
import { v5 as uuidv5 } from "uuid";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { prisma } = require("../prisma/seed/helpers") as { prisma: any };

type PatternInput = {
  name: string;
  platform: string;
  description: string;
  industryTags: string[];
  sectionOrder: string[];
  styleGuidelines: {
    colorTemperature: "light" | "dark" | "flexible";
    typographyStyle: "serif" | "sans" | "display";
    spacingDensity: "tight" | "normal" | "spacious";
    notes: string;
  };
};

const NS = "8144fbda-4974-4289-a0b3-9be590d97e80";
const patternId = (name: string) => uuidv5(name, NS);

function p(
  name: string,
  platform: string,
  sectionOrder: string[],
  style: PatternInput["styleGuidelines"],
  description: string,
  industryTags: string[]
): PatternInput {
  return { name, platform, sectionOrder, styleGuidelines: style, description, industryTags };
}

const WEBSITE_PATTERNS: PatternInput[] = [
  p("website-saas-landing-page", "website", ["navbar", "hero", "logo_cloud", "features", "social_proof", "pricing", "faq", "footer"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "spacious", notes: "Use high-contrast CTA and concise conversion copy." }, "SaaS landing pages should open with a focused value proposition and a clear primary CTA above the fold. Follow with credibility blocks such as logos and testimonial metrics before feature depth. Keep feature sections modular so users can scan quickly and compare value. Pricing and FAQ should appear before footer to remove purchase friction and support conversion intent.", ["saas", "b2b", "startup"]),
  p("website-ecommerce-product-page", "website", ["promo_banner", "product_gallery", "product_summary", "specs", "reviews", "related_products", "footer"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "normal", notes: "Prioritize product media and trust indicators." }, "E-commerce product pages should prioritize image hierarchy, price clarity, and purchase actions near the product title. The gallery and CTA area should remain visually dominant while specs and reviews support decision making. Related products should appear lower to avoid distraction before checkout intent. Keep interactions obvious with tactile buttons and clear shipping/return microcopy.", ["ecommerce", "retail", "d2c"]),
  p("website-portfolio-personal-site", "website", ["navbar", "hero", "about", "selected_work", "testimonials", "contact", "footer"], { colorTemperature: "flexible", typographyStyle: "display", spacingDensity: "spacious", notes: "Emphasize personality and project outcomes." }, "Portfolio sites should establish the creator identity immediately and then move users into featured work samples. Each project card should frame outcomes, not only visuals, to reinforce capability. Testimonials and social proof should validate trust before contact actions. Keep spacing generous to preserve an editorial, premium feel.", ["portfolio", "creator", "freelance"]),
  p("website-agency-site", "website", ["announcement", "hero", "services", "case_studies", "process", "team", "contact", "footer"], { colorTemperature: "dark", typographyStyle: "sans", spacingDensity: "spacious", notes: "Use strong contrast and polished case-study storytelling." }, "Agency websites should lead with a bold promise and quick path to discovery calls. Services need concise framing while case studies prove execution quality with measurable outcomes. Process sections reduce uncertainty by showing how delivery happens. End with a strong contact section and visible social proof to improve lead capture.", ["agency", "consulting", "services"]),
  p("website-blog-content-site", "website", ["navbar", "hero", "featured_posts", "category_grid", "newsletter", "footer"], { colorTemperature: "light", typographyStyle: "serif", spacingDensity: "normal", notes: "Readability first; avoid clutter." }, "Content-led blogs should prioritize readability and predictable navigation between categories. Featured stories should include visual anchors and metadata to support quick selection. Category and archive areas should remain simple and consistent for long-term scalability. Newsletter CTA should be integrated after high-value content, not before.", ["blog", "media", "publishing"]),
  p("website-documentation-site", "website", ["top_nav", "search", "sidebar_nav", "doc_content", "toc", "next_steps", "footer"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "normal", notes: "Use clear typographic rhythm and sticky navigation." }, "Documentation pages need stable information architecture with a persistent sidebar and table of contents. Page-level hierarchy should separate concept, steps, and code blocks clearly. Search and breadcrumb context should remain discoverable at all times. Include adjacent-navigation links to reduce user drop-off between pages.", ["documentation", "developer-tools", "api"]),
  p("website-marketing-one-pager", "website", ["hero", "problem_statement", "solution", "benefits", "cta_strip", "footer"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "spacious", notes: "Single funnel, one dominant conversion action." }, "One-pagers should maintain one narrative arc from pain point to outcome to action. Visual hierarchy must keep one CTA path obvious throughout. Section transitions should alternate tone to retain attention while scrolling. Keep copy concise and outcome-driven with minimal secondary actions.", ["marketing", "campaign"]),
  p("website-restaurant-site", "website", ["hero", "menu_highlights", "chef_story", "gallery", "reservation", "location_hours", "footer"], { colorTemperature: "flexible", typographyStyle: "display", spacingDensity: "normal", notes: "Use warm accents; food imagery and reservation CTA should dominate." }, "Restaurant pages should emphasize appetizing visuals and immediate reservation intent. Menu highlights need clear grouping and visual pricing hierarchy. Location and opening hours should be impossible to miss on mobile. Use warmer tones and tactile typography to support hospitality mood.", ["restaurant", "food", "hospitality"]),
  p("website-healthcare-site", "website", ["hero", "services", "doctor_profiles", "insurance_info", "patient_reviews", "appointment_cta", "footer"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "spacious", notes: "Trust and clarity over novelty." }, "Healthcare layouts should optimize trust with calm color choices, clear credential display, and confidence-building copy. Service cards must be easy to scan with straightforward patient outcomes. Appointment actions should be repeated and consistent across sections. Avoid visual noise and maintain accessibility-first typography.", ["healthcare", "medical", "clinic"]),
  p("website-real-estate-listing-page", "website", ["hero_search", "featured_listings", "map_preview", "agent_profiles", "buyer_seller_cta", "footer"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "normal", notes: "Highlight property media and filtering controls." }, "Real-estate pages should focus on listing discoverability with robust search and clear visual card hierarchy. Property cards must show price, location, and key specs at a glance. Agent credibility should appear before conversion CTAs. Maintain consistent filtering behavior and map/list context across breakpoints.", ["real-estate", "property"]),
  p("website-event-conference-page", "website", ["hero", "agenda", "speaker_grid", "ticket_tiers", "sponsors", "faq", "register_cta", "footer"], { colorTemperature: "dark", typographyStyle: "display", spacingDensity: "spacious", notes: "Use schedule clarity and deadline urgency." }, "Event pages should create urgency while preserving logistical clarity. The hero should communicate date, value proposition, and registration action instantly. Agenda and speaker sections should be highly scannable with consistent card structures. Ticketing and FAQ should address objections before final CTA.", ["event", "conference"]),
  p("website-app-download-landing", "website", ["hero", "feature_highlights", "phone_mockups", "reviews", "store_buttons", "footer"], { colorTemperature: "dark", typographyStyle: "sans", spacingDensity: "spacious", notes: "Mobile-first visuals and clear app-store actions." }, "App download pages should center mobile UI visuals and immediate app-store actions. Feature highlights must be concise and tied to end-user outcomes. Social proof should appear near install CTAs to reinforce trust. Keep interactions lightweight and optimized for both desktop and mobile.", ["mobile-app", "consumer-app"]),
  p("website-coming-soon-page", "website", ["hero", "countdown", "email_capture", "social_links"], { colorTemperature: "flexible", typographyStyle: "display", spacingDensity: "spacious", notes: "Minimal layout with one conversion goal." }, "Coming-soon pages should focus on one action: waitlist or notification signup. Headline and supporting copy should clearly state what is launching and for whom. Countdown and social links can support momentum but must not distract from sign-up. Keep layout minimal, high-contrast, and fast-loading.", ["launch", "waitlist"]),
  p("website-pricing-standalone-page", "website", ["hero", "billing_toggle", "pricing_cards", "comparison_table", "faq", "cta"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "normal", notes: "Ensure quick plan comparison and confidence cues." }, "Standalone pricing pages should optimize plan comparison and decision confidence. Card hierarchy should make recommended plans visually obvious without hiding alternatives. Include feature comparison and objection-handling FAQs nearby. CTA labels should map directly to plan intent and account size.", ["pricing", "subscription"]),
  p("website-nonprofit-charity-site", "website", ["hero", "mission", "impact_stats", "stories", "donation_cta", "volunteer_cta", "footer"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "spacious", notes: "Emotion + trust + donation clarity." }, "Nonprofit pages should connect mission emotion with transparent impact proof. Storytelling sections should be authentic, visual, and concise. Donation and volunteer actions should be persistent but respectful. Trust signals such as impact metrics and accountability statements should be prominent.", ["nonprofit", "charity", "community"]),
];

const SOCIAL_PATTERNS: PatternInput[] = [
  p("social-instagram-brand-strategy", "instagram", ["hook", "visual_focus", "caption_core", "cta"], { colorTemperature: "flexible", typographyStyle: "display", spacingDensity: "normal", notes: "Maximize first-second attention with bold type." }, "Instagram brand posts should prioritize immediate visual hook and headline readability at small sizes. One focal element should dominate composition while support text remains concise. Captions should reinforce the same angle without introducing new complexity. Include one clear CTA per post to improve action rate.", ["instagram", "branding"]),
  p("social-linkedin-thought-leadership", "linkedin", ["headline", "insight", "proof_point", "cta"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "normal", notes: "Professional tone and data-backed framing." }, "LinkedIn thought leadership should lead with a compelling insight and then support it with brief evidence. Visuals should feel professional and text-first, avoiding decorative clutter. Keep hierarchy strong with one key message and one takeaway CTA. Use restrained color accents for credibility.", ["linkedin", "b2b"]),
  p("social-educational-carousel", "instagram", ["cover_slide", "problem_slide", "insight_slides", "summary", "cta_slide"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "normal", notes: "Consistent slide system and numbering." }, "Educational carousels require repeatable slide scaffolding and clear progression. Cover slide should define promise, middle slides deliver concise points, and final slide drives action. Typography and spacing must stay consistent across all slides for cohesion. Include slide numbers and directional cues to support retention.", ["carousel", "education"]),
  p("social-product-launch-kit", "instagram", ["teaser", "reveal", "feature_spotlight", "social_proof", "offer_cta"], { colorTemperature: "dark", typographyStyle: "display", spacingDensity: "normal", notes: "High-contrast launch energy." }, "Launch kits should sequence anticipation to reveal to conversion in a tight narrative. Teaser visuals should create curiosity without overloading detail. Spotlight frames should emphasize one feature at a time. End with a clear offer and urgency cue.", ["launch", "product"]),
  p("social-event-promotion", "instagram", ["headline", "date_time", "speaker_highlight", "benefits", "register_cta"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "normal", notes: "Date and register CTA must remain obvious." }, "Event promotion content should keep schedule details unmistakable while preserving visual appeal. Date/time and location need top-level hierarchy. Speaker/benefit highlights should be skimmable in under five seconds. CTA wording should emphasize registration immediacy.", ["event", "promotion"]),
  p("social-testimonial-post", "instagram", ["customer_quote", "result_metric", "customer_identity", "cta"], { colorTemperature: "light", typographyStyle: "serif", spacingDensity: "spacious", notes: "Human credibility and measurable outcomes." }, "Testimonial posts should balance emotional quote content with measurable business impact. Customer identity and role should be visible to increase trust. Layout should avoid clutter so quote remains central. CTA can be subtle but should direct the next step clearly.", ["testimonial", "social-proof"]),
  p("social-behind-the-scenes", "instagram", ["context", "process_step", "team_moment", "lesson", "cta"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "normal", notes: "Authentic candid style with clear narrative and warm palette." }, "Behind-the-scenes content should feel authentic while still maintaining structural clarity. Show process moments with concise annotations and one key takeaway. Use softer visual treatment and warmer palettes to feel human. Keep CTA conversational and low pressure.", ["bts", "culture"]),
  p("social-tips-tricks-carousel", "instagram", ["cover", "tip_1", "tip_2", "tip_3", "recap", "cta"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "normal", notes: "Short actionable statements per slide." }, "Tips carousels should keep one actionable idea per slide with bold numbering. Keep copy short enough for fast mobile scanning. Visual structure must repeat for predictable reading rhythm. End with recap and save/share CTA.", ["tips", "carousel"]),
  p("social-before-after", "instagram", ["before_frame", "after_frame", "comparison_caption", "cta"], { colorTemperature: "flexible", typographyStyle: "display", spacingDensity: "normal", notes: "Clear split framing and comparison labels." }, "Before/after posts should make transformation immediately obvious through split composition. Labels and contrast should remove ambiguity about which side is improved. Use simple support text and one proof metric when possible. CTA should encourage DM or consultation conversion.", ["before-after", "transformation"]),
  p("social-sale-promo-campaign", "instagram", ["offer_headline", "discount_value", "product_focus", "urgency", "cta"], { colorTemperature: "dark", typographyStyle: "display", spacingDensity: "tight", notes: "High-energy typography and urgency hierarchy." }, "Promotion creatives should prioritize discount visibility and urgency cues. Product visuals should support, not compete with, offer text. Use strong contrast and limited copy for fast comprehension. CTA should be direct and time-sensitive.", ["sale", "promo"]),
];

const DASHBOARD_PATTERNS: PatternInput[] = [
  p("dashboard-analytics-overview", "dashboard", ["sidebar_nav", "top_bar", "kpi_row", "trend_chart", "secondary_widgets"], { colorTemperature: "dark", typographyStyle: "sans", spacingDensity: "normal", notes: "Emphasize metric hierarchy and trend readability." }, "Analytics dashboards should emphasize top KPIs first and then move into trend explanation. KPI cards need consistent visual grammar for quick comparison. Primary chart should dominate center stage with clear legends. Secondary widgets should support diagnostic depth without clutter.", ["dashboard", "analytics"]),
  p("dashboard-ecommerce-admin", "dashboard", ["sidebar_nav", "revenue_kpis", "orders_table", "inventory_alerts", "top_products"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "normal", notes: "Commerce workflows prioritize order and inventory actions." }, "E-commerce admin dashboards must highlight revenue, orders, and fulfillment bottlenecks. Table structures should optimize scanning and quick operational actions. Inventory alerts should be prioritized visually to prevent stock issues. Keep action controls close to data rows.", ["dashboard", "ecommerce"]),
  p("dashboard-saas-subscription-admin", "dashboard", ["sidebar_nav", "mrr_kpis", "churn_trend", "plan_distribution", "account_health"], { colorTemperature: "dark", typographyStyle: "sans", spacingDensity: "normal", notes: "Subscription metrics and retention signals first." }, "Subscription dashboards should lead with MRR, churn, and expansion indicators. Charts should emphasize month-over-month deltas for strategic visibility. Plan distribution and account health blocks help diagnose growth quality. Keep segmentation filters persistent in the header.", ["dashboard", "saas"]),
  p("dashboard-user-management", "dashboard", ["top_bar", "filter_row", "user_table_or_grid", "role_controls", "pagination"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "normal", notes: "Actionable user controls with safe defaults." }, "User management UIs should prioritize discoverability and role-based actions. Filters and search should sit above the data container with clear active states. Role and status controls need strong affordance and confirmation safety. Pagination and batch actions should remain predictable across states.", ["dashboard", "users"]),
  p("dashboard-content-management", "dashboard", ["top_bar", "content_filters", "drafts_table", "publish_queue", "calendar_widget"], { colorTemperature: "light", typographyStyle: "sans", spacingDensity: "normal", notes: "Balance editorial workflow and scheduling view." }, "Content management dashboards should support quick status triage and publishing cadence planning. Draft, review, and published states should be distinguishable at a glance. Queue and calendar views should complement each other. Provide contextual actions for each content row.", ["dashboard", "cms"]),
  p("dashboard-financial", "dashboard", ["summary_kpis", "cashflow_chart", "expense_breakdown", "transactions_table", "forecast_widget"], { colorTemperature: "dark", typographyStyle: "sans", spacingDensity: "normal", notes: "Precision and legibility are critical." }, "Financial dashboards should optimize numeric clarity and trust. KPI blocks should separate current value from trend direction clearly. Transaction tables need strong alignment and low visual noise. Forecast widgets should frame assumptions and ranges transparently.", ["dashboard", "finance"]),
  p("dashboard-operations-logistics", "dashboard", ["status_overview", "map_or_route_view", "shipment_table", "sla_alerts", "team_assignments"], { colorTemperature: "flexible", typographyStyle: "sans", spacingDensity: "normal", notes: "Operational urgency and exception handling first." }, "Operations dashboards should surface exceptions before routine data. Route/status visualization should provide immediate situational awareness. SLA alerts and assignment controls need strong prominence. Use color coding carefully for severity states.", ["dashboard", "operations"]),
  p("dashboard-developer-api", "dashboard", ["api_usage_kpis", "request_latency_chart", "error_breakdown", "logs_table", "api_key_controls"], { colorTemperature: "dark", typographyStyle: "sans", spacingDensity: "normal", notes: "Technical metrics + debugging pathways." }, "Developer dashboards should combine high-level API health metrics with direct debugging access. Error and latency views should be filterable by endpoint and time window. Logs table must support quick search and correlation. API key and webhook controls should be accessible but secure.", ["dashboard", "developer", "api"]),
];

const PATTERNS: PatternInput[] = [...WEBSITE_PATTERNS, ...SOCIAL_PATTERNS, ...DASHBOARD_PATTERNS];

async function main() {
  let upserts = 0;
  for (const pattern of PATTERNS) {
    const id = patternId(`${pattern.platform}:${pattern.name}`);
    await prisma.designPattern.upsert({
      where: { id },
      create: {
        id,
        name: pattern.name,
        platform: pattern.platform,
        description: pattern.description,
        industryTags: pattern.industryTags,
        sectionOrder: pattern.sectionOrder as any,
        styleGuidelines: pattern.styleGuidelines as any,
      },
      update: {
        description: pattern.description,
        industryTags: pattern.industryTags,
        sectionOrder: pattern.sectionOrder as any,
        styleGuidelines: pattern.styleGuidelines as any,
      },
    });
    upserts += 1;
    console.log(`[OK] ${pattern.name}`);
  }
  console.log(`Seeded patterns: ${upserts}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});

