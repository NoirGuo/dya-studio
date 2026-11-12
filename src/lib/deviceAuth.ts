/**
 * Noirix device authorization (device-id whitelist).
 *
 * The host checks the connected keyboard's MCU unique ID against a whitelist
 * of authorized device IDs. Whitelisted IDs are stored as SHA-256 hashes (hex)
 * so the raw device IDs are never committed.
 *
 * The whitelist is injected at build time via the Vite env var
 * `VITE_NOIRIX_AUTH_DEVICE_IDS` (comma-separated SHA-256 hex hashes). When it
 * is absent, authorization fails closed (every device is rejected), so a
 * misconfigured build cannot silently accept foreign keyboards.
 */

function loadWhitelist(): Set<string> {
  const raw = import.meta.env.VITE_NOIRIX_AUTH_DEVICE_IDS;
  if (typeof raw !== "string" || raw.trim() === "") {
    return new Set();
  }
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error(
      "WebCrypto (crypto.subtle) is unavailable in this context; device authorization cannot run.",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Return true when the device's MCU unique ID is present in the whitelist.
 *
 * The raw device ID is hashed with SHA-256 and compared against the hashes
 * injected via `VITE_NOIRIX_AUTH_DEVICE_IDS`. Because MCU unique IDs are
 * high-entropy (128-bit) random values, a leaked whitelist hash cannot be
 * reversed to forge a valid device ID.
 */
export async function isDeviceAuthorized(deviceId: Uint8Array): Promise<boolean> {
  const whitelist = loadWhitelist();
  if (whitelist.size === 0) {
    return false; // fail closed
  }
  const hash = await sha256Hex(deviceId);
  return whitelist.has(hash);
}
