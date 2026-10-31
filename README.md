# Zhatpat AI

Zhatpat AI is a mobile-first, browser-first collection of seven image/video utilities. The current work is maintained on the `development` branch; the main branch and production deployment are intentionally protected.

## Tools and actual limits

- Image to Text: Tesseract.js OCR for English, Hindi and Marathi; JPG/PNG/WebP up to 10 MB. Proofread results.
- Video Watermark Editor: local browser editing up to 5 minutes / 250 MB (device-dependent); manual fixed/moving keyframes, heuristic corner-logo candidate scan, confidence-scored template matching, WebM export. Masking is not AI pixel reconstruction.
- AI Background Remover: MODNet portrait matting, not general object segmentation; 8 MB file cap and memory-limited output.
- Classic Object Eraser: OpenCV Telea inpainting for small areas/simple backgrounds; not generative AI.
- AI Object Eraser: MI-GAN ONNX generative fill, up to 1 MP; plausible reconstruction, not exact recovery.
- Photo Restoration: Real-ESRGAN x4v3, up to 1 MP; denoising/super-resolution, not scratch/tear repair.
- AI Image Upscaler: Clark Swin2SR fixed 2×, up to 512 × 512 pixels.

## Model delivery and Hugging Face resilience

- ONNX models used by MI-GAN, Real-ESRGAN and Swin2SR are SHA-256 checked before use.
- A shared browser Cache Storage helper keeps verified model bytes locally where supported. Cache hits are re-verified before use.
- Transient HTTP 429/5xx and network errors receive a bounded retry with Retry-After support; no unbounded retry loop or paid inference API is used.
- Cache storage can be evicted by the browser or unavailable in private/restricted modes. The app then attempts a fresh verified download; if the Hub is rate-limiting or unavailable, the tool shows an error rather than loading unverified weights.
- Transformers.js background-removal uses its browser cache. Hugging Face and jsDelivr are model/runtime asset hosts, not inference endpoints; user images are processed locally.
- Model URLs currently resolve from upstream repository branches. SHA-256 pins accepted bytes, so changed weights are rejected rather than silently trusted. A future release should pin immutable Hub commit revisions as well.

## Privacy and operating constraints

Images and videos are processed in the browser; no Zhatpat inference backend is used. Model/runtime downloads still contact Hugging Face and jsDelivr. Browser cache may retain model assets. Device memory, browser codec support, CDN availability and model-host rate limits can affect first use.

## Development and release policy

- Static CI validates JavaScript syntax, key controls, tool links, sitemap, model-cache behavior and video safety guards.
- Static CI is not proof of browser runtime quality.
- Desktop and Android Chrome tests with real files, output quality checks, memory checks and audio/export checks remain required before production.
- No main-branch merge, domain configuration or production deployment is authorized by this draft PR.
