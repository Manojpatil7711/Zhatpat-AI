import "/assets/model-cache.js";
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.wasm.min.mjs";

(() => {
  const $ = id => document.getElementById(id);
  const fileInput = $("upscale-file"), drop = $("upscale-drop");
  const sourceWrap = $("upscale-source-wrap"), sourceImg = $("upscale-source");
  const runButton = $("upscale-run"), resetButton = $("upscale-reset");
  const changeButton = $("upscale-change"), progress = $("upscale-progress");
  const status = $("upscale-status"), percent = $("upscale-percent");
  const bar = $("upscale-bar"), message = $("upscale-message");
  const outputImg = $("upscale-output"), placeholder = $("upscale-placeholder");
  const download = $("upscale-download"), dimensions = $("upscale-dimensions");
  const MODEL_URL = "https://huggingface.co/clark-labs/clark-swin2sr-lightweight-x2-1.58bit/resolve/main/onnx/model.onnx.gz";
  const MODEL_SHA256 = "a37806f16f1c58cc8e5ba7b9812c1ce2b551dca950a7429a9ebc7e7f36e2e778";
  const TILE = 64, STEP = 48;
  let session = null, originalUrl = null, resultUrl = null, busy = false;

  function say(text, error = false) { message.textContent = text; message.style.color = error ? "#ff9d9d" : "#9fdcc2"; }
  function setProgress(label, value) {
    progress.hidden = false; status.textContent = label;
    percent.textContent = value == null ? "" : Math.round(value) + "%";
    bar.style.width = value == null ? "0%" : Math.max(0, Math.min(100, value)) + "%";
  }
  function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null; outputImg.removeAttribute("src"); outputImg.hidden = true;
    download.hidden = true; placeholder.hidden = false; dimensions.textContent = "PNG · 2× output";
  }
  function reset() {
    if (busy) return;
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = null; fileInput.value = ""; sourceImg.removeAttribute("src");
    sourceWrap.hidden = true; drop.hidden = false; runButton.disabled = true;
    resetButton.disabled = true; progress.hidden = true; clearResult(); say("");
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("The selected image could not be opened."));
      image.src = url;
    });
  }
  async function getSession() {
    if (session) return session;
    if (!("DecompressionStream" in window)) throw new Error("This browser does not support secure model decompression. Update Chrome and try again.");
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
    ort.env.wasm.numThreads = 1;
    setProgress("Downloading compact AI model…", 3);
    if (!window.ZhatpatModelCache) throw new Error("Secure model cache unavailable. Reload this page.");
    const compressed = await window.ZhatpatModelCache.fetchVerified(MODEL_URL, MODEL_SHA256, label => setProgress(label, 3), 4 * 1024 * 1024);
    setProgress("Unpacking and loading AI model…", 8);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    const model = await new Response(stream).arrayBuffer();
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return session;
  }
  function positions(length) {
    if (length <= TILE) return [0];
    const values = [];
    for (let p = 0; p + TILE < length; p += STEP) values.push(p);
    const last = length - TILE;
    if (values[values.length - 1] !== last) values.push(last);
    return values;
  }
  function paddedPixels(ctx, x, y, w, h) {
    const pw = Math.ceil(w / 8) * 8, ph = Math.ceil(h / 8) * 8;
    const canvas = document.createElement("canvas");
    canvas.width = pw; canvas.height = ph;
    const c = canvas.getContext("2d", { willReadFrequently: true });
    const source = ctx.getImageData(x, y, w, h);
    c.putImageData(source, 0, 0);
    if (pw > w) c.drawImage(canvas, w - 1, 0, 1, h, w, 0, pw - w, h);
    if (ph > h) c.drawImage(canvas, 0, h - 1, pw, 1, 0, h, pw, ph - h);
    return { pixels: c.getImageData(0, 0, pw, ph), width: pw, height: ph };
  }
  function makeTensor(imageData, width, height) {
    const plane = width * height, rgba = imageData.data;
    const data = new Float32Array(plane * 3);
    for (let i = 0; i < plane; i++) {
      data[i] = rgba[i * 4] / 255;
      data[plane + i] = rgba[i * 4 + 1] / 255;
      data[plane * 2 + i] = rgba[i * 4 + 2] / 255;
    }
    return new ort.Tensor("float32", data, [1, 3, height, width]);
  }
  async function upscale(image) {
    const width = image.naturalWidth, height = image.naturalHeight;
    if (width > 512 || height > 512) throw new Error("This beta supports up to 512 × 512 pixels. Resize the image and try again.");
    const input = document.createElement("canvas");
    input.width = width; input.height = height;
    const inputCtx = input.getContext("2d", { willReadFrequently: true });
    inputCtx.drawImage(image, 0, 0);
    const output = document.createElement("canvas");
    output.width = width * 2; output.height = height * 2;
    const outCtx = output.getContext("2d");
    if (!outCtx) throw new Error("Your browser could not allocate the output image. Try a smaller file.");
    const xs = positions(width), ys = positions(height), total = xs.length * ys.length;
    const ortSession = await getSession();
    let done = 0;
    for (let yi = 0; yi < ys.length; yi++) {
      for (let xi = 0; xi < xs.length; xi++) {
        const x = xs[xi], y = ys[yi], w = Math.min(TILE, width - x), h = Math.min(TILE, height - y);
        const padded = paddedPixels(inputCtx, x, y, w, h);
        const tensor = makeTensor(padded.pixels, padded.width, padded.height);
        const outputs = await ortSession.run({ pixel_values: tensor });
        const result = outputs.reconstruction;
        const rw = padded.width * 2, rh = padded.height * 2, plane = rw * rh;
        const rgba = new Uint8ClampedArray(rw * rh * 4);
        for (let i = 0; i < plane; i++) {
          rgba[i * 4] = Math.max(0, Math.min(255, result.data[i] * 255));
          rgba[i * 4 + 1] = Math.max(0, Math.min(255, result.data[plane + i] * 255));
          rgba[i * 4 + 2] = Math.max(0, Math.min(255, result.data[plane * 2 + i] * 255));
          rgba[i * 4 + 3] = 255;
        }
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = rw; tileCanvas.height = rh;
        tileCanvas.getContext("2d").putImageData(new ImageData(rgba, rw, rh), 0, 0);
        const left = xi === 0 ? 0 : (xs[xi - 1] + TILE + x) / 2;
        const right = xi === xs.length - 1 ? width : (x + TILE + xs[xi + 1]) / 2;
        const top = yi === 0 ? 0 : (ys[yi - 1] + TILE + y) / 2;
        const bottom = yi === ys.length - 1 ? height : (y + TILE + ys[yi + 1]) / 2;
        const sx = Math.round((left - x) * 2), sy = Math.round((top - y) * 2);
        const sw = Math.round((right - left) * 2), sh = Math.round((bottom - top) * 2);
        outCtx.drawImage(tileCanvas, sx, sy, sw, sh, Math.round(left * 2), Math.round(top * 2), sw, sh);
        tensor.dispose();
        done++;
        setProgress("Upscaling tile " + done + " of " + total + "…", 10 + done / total * 88);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return new Promise((resolve, reject) => output.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create the upscaled PNG.")), "image/png"));
  }
  async function handleFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return say("Choose a JPG, PNG or WebP image.", true);
    if (file.size > 4 * 1024 * 1024) return say("The selected image is larger than 4 MB.", true);
    reset(); originalUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(originalUrl);
      if (image.naturalWidth > 512 || image.naturalHeight > 512) {
        reset(); return say("This beta supports up to 512 × 512 pixels. Resize the image before uploading.", true);
      }
      sourceImg.src = originalUrl; sourceWrap.hidden = false; drop.hidden = true;
      runButton.disabled = false; resetButton.disabled = false;
      say("Image ready. Your original file stays on this device.");
    } catch (error) { reset(); say(error.message, true); }
  }
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  changeButton.addEventListener("click", () => { if (!busy) fileInput.click(); });
  resetButton.addEventListener("click", reset);
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("dragover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", event => { event.preventDefault(); drop.classList.remove("dragover"); handleFile(event.dataTransfer.files[0]); });
  runButton.addEventListener("click", async () => {
    if (!originalUrl || busy) return;
    busy = true; runButton.disabled = true; resetButton.disabled = true;
    say("Processing on your device. Keep this tab open.");
    try {
      const image = await loadImage(originalUrl), blob = await upscale(image);
      resultUrl = URL.createObjectURL(blob); outputImg.src = resultUrl; outputImg.hidden = false;
      placeholder.hidden = true; download.href = resultUrl; download.hidden = false;
      dimensions.textContent = (image.naturalWidth * 2) + " × " + (image.naturalHeight * 2) + " px · PNG";
      setProgress("Upscaling complete", 100);
      say("Done. Review the result; AI enhancement can change fine details.");
    } catch (error) { say(error && error.message ? error.message : "Something went wrong while upscaling.", true); }
    finally { busy = false; runButton.disabled = !originalUrl; resetButton.disabled = !originalUrl; }
  });
})();
