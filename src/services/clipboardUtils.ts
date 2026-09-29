/**
 * @fileoverview Cross-environment clipboard utility.
 *
 * Attempts the modern async Clipboard API first (requires a secure context —
 * HTTPS or localhost). Falls back to the legacy `document.execCommand('copy')`
 * approach for HTTP environments, embedded iframes, or browsers that have
 * denied clipboard permissions. This ensures copy/export actions never fail
 * silently or throw unhandled exceptions.
 *
 * @returns `true` if the text was successfully written to the clipboard,
 *          `false` if both methods failed (caller should surface an error UI).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // ── Modern async Clipboard API ──────────────────────────────────────────
  // Requires: HTTPS / localhost  AND  Permissions API not denied.
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or API unavailable — fall through to legacy method.
    }
  }

  // ── Legacy execCommand fallback ──────────────────────────────────────────
  // Supported in all major browsers, works over HTTP and inside iframes.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Visually hidden but reachable by the browser's copy mechanism.
  textarea.setAttribute('readonly', '');
  textarea.style.cssText =
    'position:fixed;top:-9999px;left:-9999px;width:2px;height:2px;' +
    'opacity:0;pointer-events:none;border:none;outline:none;';
  document.body.appendChild(textarea);

  try {
    textarea.focus({ preventScroll: true });
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    document.body.removeChild(textarea);
    return false;
  }
}
