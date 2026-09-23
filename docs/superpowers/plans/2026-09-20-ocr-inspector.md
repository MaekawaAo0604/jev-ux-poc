# Screenshot OCR inspector implementation plan

**Goal:** Inspect local screenshots with OCR text boxes, without website requests or Jev calls.

**Approved scope:** The user approved the first stage described in chat: saved screenshot → recognized text and positioned boxes. DOM/OCR merging, automatic mismatch classification and live exploration remain out of scope.

**Architecture:** A Node CLI accepts one local PNG and produces a new report directory with an image copy, OCR JSON and static interactive HTML. Tesseract.js runs locally with Japanese/English models cached separately. Existing step JSON may be supplied explicitly as a text-only comparison; old logs do not have coordinates and must not be drawn as DOM boxes.

**Constraints:** Preserve old reports and all existing work. No .env access, API calls, external screenshot upload or page navigation. Initial language-model download is allowed. No claim that OCR confidence is an accuracy probability. Do not correct OCR output automatically.

## Tasks (inline execution)

- [x] Add failing tests in `tests/ocr.test.ts` for PNG size validation, multiline OCR result boxes, text-only DOM reference, escaped report text, keyboard selection, hidden-box toggle and mobile geometry.
- [x] Implement `runner/ocr-data.ts` for dimensions, bounds validation and OCR line normalization; implement `runner/ocr-report.ts` for a dependency-free report with image-relative overlays.
- [x] Add `runner/ocr.ts`, a local PNG-only CLI with explicit optional `--step`, a 120-second OCR deadline, separate initialization/recognition timings, and unique output folders. Add `npm run ocr`, exact dependency and ignored model cache.
- [x] Run real OCR on the saved esa PNG. Inspect yen amount, tax and per-user/month text without altering output to match expectations. Save timings and limitations.
- [x] Run all tests/build, inspect the real result in the browser at narrow/wide sizes, and document use in README. Keep live Jev behavior unchanged.

## Verification

`npx tsx --test tests/ocr.test.ts` must fail before implementation, then pass. `npm test` and `npm run build` must pass after integration. Run `npm run ocr -- reports/2026-09-19T14-30-22.910Z-public/exploration/step-2.png --step reports/2026-09-19T14-30-22.910Z-public/exploration/step-2.json`. Verify output is a new folder and old files remain unchanged.

Expected UI behavior: selecting a line updates `aria-pressed` and highlights its box; hiding boxes preserves readable text; an empty result explicitly says nothing was recognized; hostile text remains plain text. At 390 px, no page-level horizontal overflow. Bounding boxes use source-pixel coordinates converted to percentages, with no coordinate assumptions about screenshot DPR.

## Measured result

`reports/ocr-2026-09-19T16-43-43.602Z-wbr96G/` contains 36 recognized lines, 611 ms initialization and 2948 ms recognition. Amount recognized as `¥500.`; per-user/month text recognized with inserted spaces. Tax label and orange text were not reliably recovered. This is an inspection tool, not validated OCR accuracy or UX evaluation. English-first model initialization avoids the reproducible corrupted-language warning seen with Japanese-first on this installed core; the real-OCR smoke test covers initialization and a rendered mixed-language price. All 23 tests (including local OCR) and the build passed. Wide 1280 px and narrow 390 px UI verified; temporary viewport override reset. Original and copied screenshot SHA-256 match. Read-only code review found a mixed-separator UNC-path bypass; a regression test reproduced it and normalized path validation now rejects it before filesystem access.
