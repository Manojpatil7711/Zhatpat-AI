(() => {
  const fileInput = document.getElementById("image-file");
  if (!fileInput) return;
  const dropZone = document.getElementById("drop-zone");
  const previewWrap = document.getElementById("preview-wrap");
  const preview = document.getElementById("image-preview");
  const removeButton = document.getElementById("remove-image");
  const runButton = document.getElementById("run-ocr");
  const language = document.getElementById("language");
  const progressWrap = document.getElementById("progress-wrap");
  const progressStatus = document.getElementById("progress-status");
  const progressPercent = document.getElementById("progress-percent");
  const progressBar = document.getElementById("progress-bar");
  const emptyResult = document.getElementById("result-empty");
  const result = document.getElementById("ocr-result");
  const copyButton = document.getElementById("copy-result");
  const message = document.getElementById("result-message");
  let selectedFile = null;
  let previewUrl = null;
  let busy = false;

  function setFile(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      message.textContent = "Please choose a JPG, PNG or WebP image.";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.textContent = "Image is larger than 10 MB. Choose a smaller image.";
      return;
    }
    selectedFile = file;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    previewWrap.hidden = false;
    dropZone.hidden = true;
    runButton.disabled = false;
    message.textContent = "";
    result.value = "";
    result.classList.remove("visible");
    emptyResult.hidden = false;
    copyButton.disabled = true;
  }

  fileInput.addEventListener("change", () => setFile(fileInput.files && fileInput.files[0]));
  ["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault(); dropZone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
    event.preventDefault(); dropZone.classList.remove("dragover");
  }));
  dropZone.addEventListener("drop", event => setFile(event.dataTransfer && event.dataTransfer.files[0]));
  removeButton.addEventListener("click", () => {
    selectedFile = null; fileInput.value = ""; preview.src = "";
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null; previewWrap.hidden = true; dropZone.hidden = false;
    runButton.disabled = true; result.value = ""; result.classList.remove("visible");
    emptyResult.hidden = false; copyButton.disabled = true; message.textContent = "";
  });

  runButton.addEventListener("click", async () => {
    if (!selectedFile || busy) return;
    if (!window.Tesseract || typeof window.Tesseract.createWorker !== "function") {
      message.textContent = "OCR engine did not load. Check your connection and refresh the page.";
      return;
    }
    busy = true; runButton.disabled = true; language.disabled = true;
    progressWrap.hidden = false; progressBar.style.width = "0%";
    progressStatus.textContent = "Loading OCR engine…"; progressPercent.textContent = "0%";
    message.textContent = ""; copyButton.disabled = true;
    let worker;
    try {
      worker = await Tesseract.createWorker(language.value, 1, {
        logger: event => {
          if (event.status) progressStatus.textContent = event.status.replace(/_/g, " ");
          if (typeof event.progress === "number") {
            const percent = Math.round(event.progress * 100);
            progressBar.style.width = percent + "%";
            progressPercent.textContent = percent + "%";
          }
        }
      });
      progressStatus.textContent = "Reading your image…";
      const output = await worker.recognize(selectedFile);
      result.value = (output.data && output.data.text || "").trim();
      result.classList.add("visible"); emptyResult.hidden = true;
      copyButton.disabled = !result.value;
      message.textContent = result.value ? "Extraction complete. Please review the text." : "No readable text found. Try a clearer image.";
      progressBar.style.width = "100%"; progressPercent.textContent = "100%";
      progressStatus.textContent = "Finished";
    } catch (error) {
      message.textContent = "Could not process this image. Try a clearer or smaller file.";
      progressStatus.textContent = "Could not complete";
    } finally {
      if (worker) {
        try { await worker.terminate(); } catch (_) {}
      }
      busy = false; runButton.disabled = !selectedFile; language.disabled = false;
    }
  });

  copyButton.addEventListener("click", async () => {
    if (!result.value) return;
    try {
      await navigator.clipboard.writeText(result.value);
      message.textContent = "Text copied to clipboard.";
    } catch (_) {
      result.focus(); result.select();
      message.textContent = "Select the text and copy it manually.";
    }
  });
})();