import { useCallback, useEffect, useRef, useState } from "react";
import { Request, Response } from "../proto/zmk/auth/auth";
import { useCustomSubsystem } from "./useCustomSubsystem";
import { useConnection } from "./useConnection";
import { isDeviceAuthorized } from "../lib/deviceAuth";

export const NOIRIX_AUTH_SUBSYSTEM_IDENTIFIER = "noirix__auth";

const CODEC = {
  encode: (request: Request) => Request.encode(request).finish(),
  decode: (payload: Uint8Array) => Response.decode(payload),
};

export type DeviceAuthStatus =
  | "idle"
  | "pending"
  | "verified"
  | "rejected"
  | "unsupported";

export interface UseDeviceAuthReturn {
  status: DeviceAuthStatus;
  error: string | null;
}

/** How long to wait for the auth subsystem to be discovered before failing. */
const SETTLE_MS = 1200;

/**
 * Reads the connected keyboard's MCU unique ID once per connection and checks
 * it against the authorized-device whitelist. A device without the
 * `noirix__auth` subsystem (i.e. any stock ZMK keyboard) is reported as
 * `unsupported`; a device whose ID is not whitelisted is reported as
 * `rejected`.
 */
export function useDeviceAuth(): UseDeviceAuthReturn {
  const { subsystem, ready, call } = useCustomSubsystem(
    NOIRIX_AUTH_SUBSYSTEM_IDENTIFIER,
    CODEC,
    { unlockGate: false },
  );
  const { isConnected, connectionMethod } = useConnection();
  const [status, setStatus] = useState<DeviceAuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const attemptedRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);

  const isDemo = connectionMethod === "demo";

  const reset = useCallback(() => {
    attemptedRef.current = false;
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setStatus("idle");
    setError(null);
  }, []);

  useEffect(() => {
    if (!isConnected) {
      reset();
      return;
    }
    if (isDemo) {
      setStatus("verified");
      return;
    }
    if (attemptedRef.current) return;

    if (subsystem && ready && call) {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      attemptedRef.current = true;
      setStatus("pending");
      setError(null);

      void (async () => {
        try {
          const resp = await call(Request.create({ authenticate: {} }));
          if (!resp) {
            setStatus("rejected");
            setError("设备未响应身份校验。");
            return;
          }
          if (resp.error) {
            setStatus("rejected");
            setError(resp.error.message || "设备身份校验失败。");
            return;
          }
          const auth = resp.authenticate;
          if (!auth) {
            setStatus("rejected");
            setError("设备返回了无效的身份校验响应。");
            return;
          }
          const ok = await isDeviceAuthorized(auth.deviceId);
          setStatus(ok ? "verified" : "rejected");
          setError(ok ? null : "该设备未在授权名单中，仅支持自有 Noirix 键盘。");
        } catch (err) {
          setStatus("rejected");
          setError(err instanceof Error ? err.message : "设备身份校验失败。");
        }
      })();
      return;
    }

    // Subsystem not discovered yet: keep checking, then fail as unsupported.
    setStatus("pending");
    setError(null);
    if (settleTimerRef.current === null) {
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (!attemptedRef.current) {
          attemptedRef.current = true;
          setStatus("unsupported");
          setError("该设备不支持身份校验（不是受支持的 Noirix 键盘）。");
        }
      }, SETTLE_MS);
    }
  }, [isConnected, isDemo, subsystem, ready, call, reset]);

  return { status, error };
}
