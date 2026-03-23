import crypto from "crypto";

type ComputePromptStructureHashParams = {
  systemPromptVersion: string;
  templateIds: string[];
  platform: string;
  format: string;
};

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Deterministic "prompt structure" hash used to group generations for scoring.
 *
 * Notes:
 * - templateIds are sorted before hashing to make ordering irrelevant
 * - only structural prompt components are included (system prompt version + templates + platform/format)
 */
export function computePromptStructureHash(params: ComputePromptStructureHashParams): string {
  const templateIdsSorted = [...(params.templateIds ?? [])].sort();
  const payload = JSON.stringify({
    systemPromptVersion: params.systemPromptVersion ?? "",
    templateIds: templateIdsSorted,
    platform: params.platform ?? "",
    format: params.format ?? "",
  });
  return sha256Hex(payload);
}

