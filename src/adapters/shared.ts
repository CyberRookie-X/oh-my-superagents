export const SAFE_NAME_PATTERN = /^[a-z0-9-]+$/;

export interface ProfileLike {
  model: string;
  variant?: string;
  effort?: string;
  codexFast?: boolean;
  temperature?: number;
}

export function validateProfile(
  profiles: Record<string, ProfileLike>,
  profileId: string,
): ProfileLike {
  const profile = profiles[profileId];
  if (!profile) throw new Error(`Unknown profile: ${profileId}`);
  return profile;
}

export interface RouteOwnershipInfo {
  canonicalRoute: string;
  host: string;
  profileId: string;
  source: string;
  stage?: number;
}

export function buildRouteOwnershipMarker(info: RouteOwnershipInfo): string {
  const parts = [
    `canonicalRoute=${info.canonicalRoute}`,
    `host=${info.host}`,
    `profile=${info.profileId}`,
    `source=${info.source}`,
  ];
  if (info.stage !== undefined) parts.push(`stage=${info.stage}`);
  return `<!-- oms-route: ${parts.join(" ")} -->`;
}

export function renderYamlFrontmatter(
  fields: Record<string, string | number | boolean | undefined>,
): string {
  const lines: string[] = ["---"];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "string") {
      lines.push(`${key}: '${value.replace(/'/g, "''")}'`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push("---");
  return lines.join("\n") + "\n";
}
