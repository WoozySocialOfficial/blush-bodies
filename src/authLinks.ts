export type AuthLinkTokens = {
  accessToken: string;
  refreshToken: string;
  type?: string;
};

const authParameters = (url: string) => {
  const hash = url.includes("#") ? url.slice(url.indexOf("#") + 1) : "";
  const query = url.includes("?")
    ? url.slice(url.indexOf("?") + 1, url.includes("#") ? url.indexOf("#") : undefined)
    : "";
  return new URLSearchParams(hash || query);
};

export const authTokensFromUrl = (url: string): AuthLinkTokens | null => {
  try {
    const parameters = authParameters(url);
    const accessToken = parameters.get("access_token");
    const refreshToken = parameters.get("refresh_token");
    if (!accessToken || !refreshToken) return null;
    return {
      accessToken,
      refreshToken,
      type: parameters.get("type") ?? undefined,
    };
  } catch {
    return null;
  }
};

export const authRedirectUrl = (
  platform: "web" | "native",
  webOrigin?: string,
) =>
  platform === "web" && webOrigin
    ? `${webOrigin.replace(/\/$/, "")}/`
    : "blushbodies://auth";
