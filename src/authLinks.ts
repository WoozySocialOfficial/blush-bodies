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

export const passwordResetErrorMessage = (error: unknown) => {
  const authError =
    error && typeof error === "object"
      ? (error as { code?: unknown; message?: unknown; status?: unknown })
      : {};
  const code = typeof authError.code === "string" ? authError.code : "";
  const message =
    typeof authError.message === "string" ? authError.message.toLowerCase() : "";
  const status = typeof authError.status === "number" ? authError.status : 0;

  if (code === "over_email_send_rate_limit" || status === 429)
    return "Too many recovery emails were requested. Wait a few minutes and try again.";
  if (code === "email_address_not_authorized")
    return "Password recovery email is not available for this address yet.";
  if (status >= 500 || message.includes("error sending recovery email"))
    return "Our recovery email service is temporarily unavailable. Please try again shortly.";
  return "The recovery email could not be sent. Please try again.";
};
