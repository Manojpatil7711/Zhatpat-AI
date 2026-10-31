# Zhatpat AI

**Create. Edit. Enhance.**

Zhatpat AI is a mobile-first static web toolkit in development.

## Available browser tools
- **Image to Text (beta):** Tesseract.js OCR for English, Hindi and Marathi. Accuracy depends on source quality and needs user review.
- **Video Watermark Remover (beta):** local browser workflow for user-owned videos up to 5 minutes / 250 MB (device-dependent). Supports manual fixed/keyframed regions, a heuristic sampled-frame corner-logo candidate scan, and confidence-scored template matching for motion tracking. Exports WebM. Blur/pixelate/cover are masking treatments, not content-aware AI inpainting; auto-detection and tracking require user review and may miss or drift.

## Planned tools
- AI background removal
- Object erasing
- Photo restoration
- Additional creator-focused image tools

Planned features are not presented as available until implemented and tested.

## SEO foundation
- Canonical URLs and per-page metadata
- XML sitemap and robots.txt
- Individual indexable tool pages
- GitHub Actions checks for required pages and sitemap entries

The sitemap currently lists the homepage, privacy page and the two available tool pages. Submit `https://zhatpat-ai.dev/sitemap.xml` in Search Console only after the custom domain is verified and the production deployment is live.

## Technical approach
- Static HTML, CSS and JavaScript; no build step
- Browser-side processing where practical
- No paid inference API or ad scripts
- No secrets or API tokens committed

## Development
Active work happens on `development`. The `main` branch remains separate until review and approval.
