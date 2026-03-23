/** Scopes assignable to external API keys (Sprint 18). */
export const API_KEY_PERMISSION_LABELS: Record<string, string> = {
  "design:generate": "Generate new designs via API",
  "design:read": "Read existing designs and their HTML",
  "design:export": "Export designs to PNG, JPG, PDF",
  "design:approve": "Approve designs (workflow status)",
  "design:revise": "Request revisions on existing designs",
  "brand:read": "Read brand profiles (required for branded generation)",
  "batch:create": "Submit and manage batch generation jobs",
  "templates:read": "Access the template library",
  "webhooks:test": "Send test deliveries to your configured webhook URL",
  "keys:rotate": "Rotate the API key used for this request (v1 only)",
};

export const ALL_API_KEY_PERMISSIONS: string[] = Object.keys(API_KEY_PERMISSION_LABELS);

export type ApiKeyPermission = keyof typeof API_KEY_PERMISSION_LABELS;
