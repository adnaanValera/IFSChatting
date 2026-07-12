export const API_BASE_URL = "https://www.interfreightsolutions.com";
export const APP_UPDATE_URL = `${API_BASE_URL}/app-install`;
export const MOBILE_APP_LATEST_VERSION = "1.0.1";

export function compareVersions(a: string, b: string) {
  const aParts = a.split(".").map((part) => Number(part) || 0);
  const bParts = b.split(".").map((part) => Number(part) || 0);
  const length = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (aParts[i] || 0) - (bParts[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
