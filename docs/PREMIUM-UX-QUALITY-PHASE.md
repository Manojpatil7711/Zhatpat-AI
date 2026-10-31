# Zhatpat AI — Premium UX Quality Phase

Status: in progress on the development branch only. This document is the acceptance baseline for the seven existing browser-beta tools and model delivery. It is not a claim that device/runtime QA is complete.

## Product principles
- Make the actual capability and limitations obvious before upload.
- Keep the editing task visually dominant; keep explanations scannable and close to the relevant controls.
- Use consistent upload, selected-file, progress, result, reset/change, error, and download patterns.
- Be honest about local processing: user images are processed in-browser, while model/runtime assets may be downloaded from third-party CDNs.
- Design mobile-first for Android Chrome, including touch targets, readable labels, keyboard focus, and low-memory behavior.
- Never call a tool production-ready until real browser and Android tests pass.

## Per-tool information requirements and acceptance checks

### 1. Image to Text (OCR)
- Explain supported JPG/PNG/WebP, 10 MB limit, one selected language per run, and English/Hindi/Marathi support.
- Show clear upload preview, language selector, extraction progress, editable detected text, copy action, and reset/change image.
- Explain that OCR is not guaranteed for handwriting, low-light, skewed, or mixed-language content; user must proofread.
- Verify language model download, worker cleanup, repeated runs, copy fallback, and Marathi/Hindi output in Android Chrome.

### 2. Video Watermark Remover
- Explain MP4/WebM/MOV input, 5-minute/250 MB input limit, WebM output, static and keyframed masks, and the experimental corner-logo candidate scan.
- Make the workflow explicit: upload → optional corner-logo candidate scan or manual draw → choose static/moving → add keyframes if moving → process → preview → download.
- Clearly state it masks the watermark; it does not reconstruct pixels behind it. Use only content the user owns or may edit.
- Verify aspect-ratio coordinate mapping, auto-scan false-positive/false-negative behavior, seeking/keyframe interpolation, audio handling, export codec support, cancellation/error handling, and Android memory behavior. Automatic corner scan is heuristic, not a trained logo detector; never claim complete detection.

### 3. AI Background Remover
- Clearly describe portrait matting (people/portraits), not general product/object segmentation.
- Explain 8 MB input limit, transparent PNG output, first-use model download, and device-dependent speed.
- Verify transparent edges, hair/fine detail, orientation, image dimensions, reset/change behavior, and Android memory.

### 4. Classic Object Eraser
- Label it classical Telea inpainting, not generative AI.
- Explain small objects on simple backgrounds; larger/complex objects may leave artifacts.
- Explain brush, undo, clear, erase, result preview, PNG download and actual input/output resolution behavior.
- Verify pointer/touch drawing, brush scaling, undo/clear, repeated runs, and memory limits.

### 5. Photo Restoration
- Explain Real-ESRGAN denoising/super-resolution, 6 MB and 1 MP input limits, 4× PNG output, first-use model download.
- Explicitly say it is not scratch/tear/faded-colour repair and may synthesize plausible detail.
- Verify tile seams, dimensions, orientation, large output memory, and Android runtime.

### 6. AI Object Eraser
- Explain MI-GAN generative fill, 6 MB and 1 MP limit, ~28 MB first-use model download, brush/undo/clear, PNG output.
- Explain that hidden pixels are generated plausibly, not recovered exactly.
- Verify mask polarity, brush/touch mapping, model integrity/load failure, output dimensions, repeated edits, and Android memory.

### 7. AI Image Upscaler
- Explain fixed 2× output, 4 MB and 512×512 input limit, PNG output, ~1.7 MB compressed model download.
- State it cannot guarantee recovery of missing details and is not a 4× upscaler.
- Verify decompression/hash checks, tile boundaries, output dimensions, image orientation, and Android performance.

## Model delivery and Hugging Face resilience\n- Verify SHA-256 before using ONNX model bytes.\n- Use persistent browser cache where supported; re-verify cached bytes before use.\n- Retry only transient 429/5xx/network failures with a bounded retry count and respect Retry-After. Never retry indefinitely.\n- Treat browser cache as an optimization, not guaranteed storage: private mode, quota pressure and browser eviction can remove it.\n- If the Hub is unavailable and no verified cache exists, fail clearly. Do not bypass integrity checks, switch to an unverified mirror, or call a paid inference endpoint.\n- Transformers.js model caching is enabled for MODNet; verify cache hit, first download, throttling failure and offline failure in a browser.\n- Pin upstream model revisions to immutable commit hashes when available; retain SHA-256 checks so a changed upstream file is rejected.\n\n## Shared premium UX acceptance
- Consistent header, breadcrumb, intro, facts, workspace panels, result stage, help, privacy/model disclosure, and footer.
- Clear file constraints before choosing a file; specific validation errors; busy state prevents duplicate runs.
- Progress has accessible status text; success and failure are announced with live regions.
- Every visible control has a meaningful label and keyboard focus state; touch targets are comfortable on phones.
- Result preview is readable, download action is obvious, and changing/resetting input does not leave stale output.
- No deceptive “AI” claims, no invented speed/accuracy promises, no hidden upload claims.
- No unrelated project, main-branch, production-domain, or deployment changes.

## Release gates
1. Static checks and regression CI pass.
2. Each tool's HTML controls match its JavaScript selectors.
3. Desktop browser runtime QA passes.
4. Android Chrome QA passes with real sample files.
5. Accessibility, privacy copy, model/licence links, and mobile layout are reviewed.
6. Only then request approval to merge the draft PR. Production deployment/domain setup remains a separate explicit approval.
