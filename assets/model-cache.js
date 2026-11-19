/* Verified persistent model cache with SHA-256 checks and bounded retries for temporary Hub/CDN throttling. */
(() => {
  const CACHE_NAME = "zhatpat-ai-verified-models-v1";
  async function digest(buffer) {
    if (!globalThis.crypto?.subtle) throw new Error("Secure model verification is unavailable. Open this site over HTTPS in an up-to-date browser.");
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
  }
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function fetchVerified(url, expectedHash, onStatus, maxBytes = 64 * 1024 * 1024) {
    const request = new Request(url, { method: "GET" });
    let cache = null;
    try { if ("caches" in globalThis) cache = await caches.open(CACHE_NAME); } catch (_) {}
    if (cache) {
      try {
        const cached = await cache.match(request);
        if (cached) {
          const bytes = await cached.arrayBuffer();
          if (await digest(bytes) === expectedHash) { onStatus?.("Using verified model saved on this device"); return bytes; }
          await cache.delete(request);
        }
      } catch (_) { try { await cache.delete(request); } catch (_) {} }
    }
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        onStatus?.(attempt ? "Retrying after a temporary model-host limit…" : "Downloading and verifying AI model…");
        const response = await fetch(request);
        if (!response.ok) {
          const error = new Error(response.status === 429
            ? "Hugging Face is temporarily rate-limiting this model download (HTTP 429). Wait and retry; verified cached models do not need another download."
            : "AI model download failed (HTTP " + response.status + "). Check your connection and retry.");
          error.status = response.status; lastError = error;
          if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) throw error;
          const retryAfter = Number(response.headers.get("Retry-After"));
          await pause(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(10000, retryAfter * 1000) : [1200, 3000][attempt]);
          continue;
        }
        const declaredLength = Number(response.headers.get("Content-Length"));
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error("The model host returned a file larger than the configured safety limit.");
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > maxBytes) throw new Error("The downloaded model exceeds the configured safety limit.");
        if (await digest(bytes) !== expectedHash) throw new Error("AI model integrity check failed. The model was not loaded and no image was processed.");
        if (cache) { try { await cache.put(request, new Response(bytes.slice(0), { headers: { "Content-Type": "application/octet-stream" } })); } catch (_) {} }
        return bytes;
      } catch (error) {
        lastError = error;
        if (error?.status || /integrity check failed|Secure model verification/.test(error?.message || "")) throw error;
        if (attempt < 2) await pause([1200, 3000][attempt]);
      }
    }
    throw lastError || new Error("The AI model could not be downloaded. Please try again later.");
  }
  window.ZhatpatModelCache = Object.freeze({ fetchVerified });
})();