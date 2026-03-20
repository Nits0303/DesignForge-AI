export const DEFAULT_SECTION_PLANS: {
  website: Record<string, string[]>;
  dashboard: Record<string, string[]>;
} = {
  website: {
    landing_page: ["navbar", "hero", "social_proof", "features", "testimonials", "pricing", "faq", "footer"],
    hero_section: ["navbar", "hero", "footer"],
    features_section: ["navbar", "features", "footer"],
    pricing_section: ["navbar", "pricing", "footer"],
    about_page: ["navbar", "about", "footer"],
    contact_page: ["navbar", "contact", "footer"],
    blog_page: ["navbar", "blog", "footer"],
    coming_soon: ["navbar", "hero", "footer"],
  },
  dashboard: {
    analytics_dashboard: [
      "sidebar_nav",
      "top_bar",
      "kpi_row",
      "chart_primary",
      "chart_secondary",
      "data_table",
      "activity_feed",
    ],
    admin_panel: ["sidebar_nav", "top_bar", "action_bar", "data_table", "pagination"],
    settings_page: ["sidebar_nav", "top_bar", "settings_sections"],
    data_table: ["sidebar_nav", "top_bar", "data_table", "pagination"],
    user_management: ["sidebar_nav", "top_bar", "filter_bar", "user_table", "pagination"],
  },
};

