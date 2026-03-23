/**
 * iOS / Android / cross-platform convention blocks for prompt assembly (Sprint 14).
 */

export function buildIosConventionsXml(): string {
  return `<ios_conventions>
<navigation>Root screens may use large title navigation (34px, font-weight 700). Pushed screens use standard nav bars (17px, font-weight 600). Use chevron-left back affordance — avoid hamburger menus on root; prefer tab bars and stacks.</navigation>
<typography>Use font stack: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif. Type scale: Large Title 34px, Title1 28px, Title2 22px, Title3 20px, Headline 17px semibold, Body 17px, Callout 16px, Subhead 15px, Footnote 13px, Caption 12px.</typography>
<controls>iOS-style pill toggles (2:1) green when on. Buttons: filled (rounded 12px), tinted, or plain text. Destructive: #ff3b30. Segmented controls for binary choices. List rows: chevron-right for navigation.</controls>
<spacing>16px horizontal content margins. Section headers 16px above first cell. Minimum touch targets 44px height.</spacing>
<system_colors>Primary interactive blue #007aff, success green #34c759, destructive #ff3b30. Use for controls; brand colors apply to hero/illustration areas.</system_colors>
</ios_conventions>`;
}

export function buildAndroidConventionsXml(brandPrimary?: string): string {
  const primary = brandPrimary ?? "#6750A4";
  return `<android_conventions>
<navigation>Material 3: bottom navigation for primary destinations (3-5). Top app bar with title; optional overflow. FAB 56x56 bottom-right, radius 28px for primary action.</navigation>
<typography>Use 'Inter', sans-serif. Scale: Display Large 57px, Headline Large 32px, Title Large 22px, Title Medium 16px, Body Large 16px, Body Medium 14px, Label Large 14px semibold.</typography>
<controls>Material 3 switches wider than iOS; chips for filters; text fields outlined or filled. Cards radius 12px; use elevation shadows to separate sections.</controls>
<spacing>4px base grid; 16px horizontal padding.</spacing>
<colors>Use brand primary ${primary} as colorPrimary; derive a sensible secondary by rotating hue ~30°. Error/destructive #b3261e.</colors>
</android_conventions>`;
}

export function buildCrossPlatformConventionsXml(): string {
  return `<cross_platform_conventions>
Moderate corner radius (10px). Inter for all text. Generic icon style. Minimum 44px touch targets. Bottom navigation acceptable. Avoid platform-specific-only motifs (Dynamic Island shape, Material ripple as sole affordance).</cross_platform_conventions>`;
}
