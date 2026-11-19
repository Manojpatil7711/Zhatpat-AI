(() => {
  const $ = (id) => document.getElementById(id);
  const fileInput = $("restore-file");
  const drop = $("restore-drop");
  const sourceWrap = $("restore-source-wrap");
  const sourceImg = $("restore-source");
  const runButton = $("restore-run");
  const resetButton = $("restore-reset");
  const changeButton = $("restore-change");
  const progress = $("restore-progress");
  const status = $("restore-status");
  const percent = $("restore-percent");
  const bar = $("restore-bar");
  const message = $("restore-message");
  const outputImg = $("restore-output");
  const placeholder = $("restore-placeholder");
  const download = $("restore-download");
  const dimensions = $("restore-dimensions");

  const MODEL_URL = "https://huggingface.co/openpixels-app/browser-models/resolve/main/realesr_general_x4v3.onnx";
  const MODEL_SHA256 = "0e121299bf9b23a764d3f9e2120d0d0727d5ac5032e03a46cb78d28bcc7c6872";
  const RUNTIME_VERSION = "1.22.0";
  const TILE = 128;
  const STEP = 96;
  let session = null;
  let originalUrl = null;
  let resultUrl = null;
  let busy = false;

  function say(text, error = false) {
    message.textContent = text;
    message.style.color = error ? "#ff9d9d" : "#9fdcc2";
  }
  function setProgress(text, value) {
    progress.hidden = false;
    status.textContent = text;
    percent.textContent = value == null ? "" : Math.round(value) + "%";
    bar.style.width = value == null ? "0%" : Math.max(0, Math.min(100, value)) + "%";
  }
  function clearResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    outputImg.removeAttribute("src");
    outputImg.hidden = true;
    download.hidden = true;
    placeholder.hidden = false;
    dimensions.textContent = "PNG · 4× output";
  }
  function reset() {
    if (busy) return;
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    originalUrl = null;
    fileInput.value = "";
    sourceImg.removeAttribute("src");
    sourceWrap.hidden = true;
    drop.hidden = false;
    runButton.disabled = true;
    resetButton.disabled = true;
    progress.hidden = true;
    clearResult();
    say("");
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
    if (!window.ort || !ort.InferenceSession) throw new Error("The AI runtime did not load. Check your connection and reload the page.");
    ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@" + RUNTIME_VERSION + "/dist/";
    ort.env.wasm.numThreads = 1;
    setProgress("Downloading AI model…", 2);
    if (!window.ZhatpatModelCache) throw new Error("Secure model cache unavailable. Reload this page.");
    const model = await window.ZhatpatModelCache.fetchVerified(MODEL_URL, MODEL_SHA256, label => setProgress(label, 2), 8 * 1024 * 1024);
    setProgress("Loading AI model…", 8);
    session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    return session;
  }
  function positions(length) {
    if (length <= TILE) return [0];
    const result = [];
    for (let p = 0; p + TILE < length; p += STEP) result.push(p);
    const last = length - TILE;
    if (result[result.length - 1] !== last) result.push(last);
    return result;
  }
  function makeTensor(imageData, width, height) {
    const plane = width * height;
    const data = new Float32Array(3 * plane);
    const pixels = imageData.data;
    for (let i = 0; i < plane; i++) {
      data[i] = pixels[i * 4] / 255;
      data[plane + i] = pixels[i * 4 + 1] / 255;
      data[plane * 2 + i] = pixels[i * 4 + 2] / 255;
    }
    return new ort.Tensor("float32", data, [1, 3, height, width]);
  }
  async function enhance(image) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (width * height > 1000000) throw new Error("This beta supports up to 1 megapixel. Please resize the photo and try again.");
    const inputCanvas = document.createElement("canvas");
    inputCanvas.width = width;
    inputCanvas.height = height;
    const inputContext = inputCanvas.getContext("2d", { willReadFrequently: true });
    inputContext.drawImage(image, 0, 0);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = width * 4;
    outputCanvas.height = height * 4;
    const outputContext = outputCanvas.getContext("2d");
    if (!outputContext) throw new Error("Your browser could not allocate the output image. Try a smaller photo.");
    const xs = positions(width);
    const ys = positions(height);
    const total = xs.length * ys.length;
    let completed = 0;
    const ortSession = await getSession();

    for (let yi = 0; yi < ys.length; yi++) {
      for (let xi = 0; xi < xs.length; xi++) {
        const x = xs[xi], y = ys[yi];
        const tileWidth = Math.min(TILE, width - x);
        const tileHeight = Math.min(TILE, height - y);
        const pixels = inputContext.getImageData(x, y, tileWidth, tileHeight);
        const tensor = makeTensor(pixels, tileWidth, tileHeight);
        const feeds = {};
        feeds[ortSession.inputNames[0]] = tensor;
        let outputs = null;
        try {
          outputs = await ortSession.run(feeds);
          const output = outputs[ortSession.outputNames[0]];
          const outW = tileWidth * 4, outH = tileHeight * 4;
          const rgba = new Uint8ClampedArray(outW * outH * 4);
          const plane = outW * outH;
          for (let i = 0; i < plane; i++) {
            rgba[i * 4] = Math.max(0, Math.min(255, output.data[i] * 255));
            rgba[i * 4 + 1] = Math.max(0, Math.min(255, output.data[plane + i] * 255));
            rgba[i * 4 + 2] = Math.max(0, Math.min(255, output.data[plane * 2 + i] * 255));
            rgba[i * 4 + 3] = 255;
          }
          const tileCanvas = document.createElement("canvas");
          tileCanvas.width = outW;
          tileCanvas.height = outH;
          tileCanvas.getContext("2d").putImageData(new ImageData(rgba, outW, outH), 0, 0);

          // Split each overlap at its midpoint. This also handles very narrow
          // final tiles without leaving gaps or overwriting previously drawn pixels.
          const leftBoundary = xi === 0 ? 0 : (xs[xi - 1] + TILE + x) / 2;
          const rightBoundary = xi === xs.length - 1 ? width : (x + TILE + xs[xi + 1]) / 2;
          const topBoundary = yi === 0 ? 0 : (ys[yi - 1] + TILE + y) / 2;
          const bottomBoundary = yi === ys.length - 1 ? height : (y + TILE + ys[yi + 1]) / 2;
          const sx = Math.round((leftBoundary - x) * 4);
          const sy = Math.round((topBoundary - y) * 4);
          const dx = Math.round(leftBoundary * 4);
          const dy = Math.round(topBoundary * 4);
          const sw = Math.round((rightBoundary - leftBoundary) * 4);
          const sh = Math.round((bottomBoundary - topBoundary) * 4);
          outputContext.drawImage(tileCanvas, sx, sy, sw, sh, dx, dy, sw, sh);
        } finally {
          tensor.dispose();
          if (outputs) Object.values(outputs).forEach(value => {
            if (value && typeof value.dispose === "function") value.dispose();
          });
        }
        completed++;
        setProgress("Enhancing tile " + completed + " of " + total + "…", 10 + (completed / total) * 88);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    return new Promise((resolve, reject) => outputCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not create the enhanced PNG.")), "image/png"));
  }
  async function handleFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return say("Choose a JPG, PNG or WebP image.", true);
    if (file.size > 6 * 1024 * 1024) return say("The selected photo is larger than 6 MB.", true);
    reset();
    originalUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(originalUrl);
      if (image.naturalWidth * image.naturalHeight > 1000000) {
        reset();
        return say("This beta supports up to 1 megapixel. Please resize the photo before uploading.", true);
      }
      sourceImg.src = originalUrl;
      sourceWrap.hidden = false;
      drop.hidden = true;
      runButton.disabled = false;
      resetButton.disabled = false;
      say("Photo ready. Your original file stays on this device.");
    } catch (error) {
      reset();
      say(error.message, true);
    }
  }
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  changeButton.addEventListener("click", () => { if (!busy) fileInput.click(); });
  resetButton.addEventListener("click", reset);
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("dragover"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
  drop.addEventListener("drop", event => { event.preventDefault(); drop.classList.remove("dragover"); handleFile(event.dataTransfer.files[0]); });
  runButton.addEventListener("click", async () => {
    if (!originalUrl || busy) return;
    busy = true;
    runButton.disabled = true;
    resetButton.disabled = true;
    say("Processing on your device. Keep this tab open.");
    try {
      const image = await loadImage(originalUrl);
      const blob = await enhance(image);
      resultUrl = URL.createObjectURL(blob);
      outputImg.src = resultUrl;
      outputImg.hidden = false;
      placeholder.hidden = true;
      download.href = resultUrl;
      download.hidden = false;
      dimensions.textContent = (image.naturalWidth * 4) + " × " + (image.naturalHeight * 4) + " px · PNG";
      setProgress("Enhancement complete", 100);
      say("Done. Review the result before downloading; AI may reconstruct details.");
    } catch (error) {
      say(error && error.message ? error.message : "Something went wrong while enhancing this photo.", true);
    } finally {
      busy = false;
      runButton.disabled = !originalUrl;
      resetButton.disabled = !originalUrl;
    }
  });
})();