import { RegionProfileSchema, type RegionProfile } from "./schema";
import plJson from "./profiles/pl.json";

export * from "./schema";

const profiles: Record<string, RegionProfile> = {
  pl: RegionProfileSchema.parse(plJson),
};

export function listRegionIds(): string[] {
  return Object.keys(profiles);
}

export function getRegionProfile(id: string): RegionProfile {
  const profile = profiles[id];
  if (!profile) {
    throw new Error(`Невідомий регіональний профіль: ${id}`);
  }
  return profile;
}
