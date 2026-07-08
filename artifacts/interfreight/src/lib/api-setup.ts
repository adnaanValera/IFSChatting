import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";

export function setupApiClient() {
  // Set the base URL for the API
  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  setBaseUrl(baseUrl || "/");

  // Configure token getter for all API calls
  setAuthTokenGetter(() => {
    return localStorage.getItem("intf_token");
  });
}
