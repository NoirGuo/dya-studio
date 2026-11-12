import { useDeviceAuth } from "../hooks/useDeviceAuth";
import { useConnection } from "../hooks/useConnection";

/**
 * Blocks the app until the connected keyboard passes device authentication.
 *
 * Renders a full-screen overlay while the challenge-response is in flight and
 * a rejection screen (with a way back) when the device is not a supported
 * Noirix keyboard. Demo mode is always trusted and never gated.
 */
export function DeviceAuthGate() {
  const connection = useConnection();
  const { status, error } = useDeviceAuth();

  const active =
    connection.isConnected &&
    connection.connectionMethod !== "demo" &&
    (status === "pending" || status === "rejected" || status === "unsupported");

  if (!active) return null;

  const pending = status === "pending";
  const title = pending ? "正在校验设备…" : "无法使用该设备";
  const detail = pending
    ? "正在验证键盘身份，请稍候。"
    : (error ?? "该设备未通过身份校验，仅支持自有 Noirix 键盘。");

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-6 text-center shadow-2xl">
        {pending ? (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-electric)]" />
        ) : (
          <div
            className="mx-auto mb-4 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: "#ef4444" }}
          >
            !
          </div>
        )}
        <h1 className="mb-2 text-lg font-medium text-[var(--color-text)]">
          {title}
        </h1>
        <p className="mb-5 text-sm text-[var(--color-text-muted)]">{detail}</p>
        {!pending && (
          <button
            type="button"
            onClick={connection.onDisconnect}
            className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--color-border)] px-5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-hover)]"
          >
            断开连接
          </button>
        )}
      </div>
    </div>
  );
}
