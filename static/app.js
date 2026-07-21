const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const fileList = document.getElementById("file-list");
const results = document.getElementById("results");
const convertBtn = document.getElementById("convert-btn");
const clearBtn = document.getElementById("clear-btn");
const statusBar = document.getElementById("status-bar");
const qualityInput = document.getElementById("quality");
const qualityValue = document.getElementById("quality-value");
const scaleChips = document.querySelectorAll(".scale-chip:not(.scale-chip-custom)");
const scaleCustomToggle = document.getElementById("scale-custom-toggle");
const scaleCustomInput = document.getElementById("scale-custom");
const maxWidthInput = document.getElementById("max-width");
const maxHeightInput = document.getElementById("max-height");
const tabOriginals = document.getElementById("tab-originals");
const tabConverted = document.getElementById("tab-converted");
const tabContentOriginals = document.getElementById("tab-content-originals");
const tabContentConverted = document.getElementById("tab-content-converted");
const countOriginals = document.getElementById("count-originals");
const countConverted = document.getElementById("count-converted");
const downloadZipBtn = document.getElementById("download-zip-btn");
const convertedEmpty = document.getElementById("converted-empty");
const progressBar = document.getElementById("progress");
const progressFill = document.getElementById("progress-fill");

let files = [];
let converted = [];

qualityInput.addEventListener("input", () => {
  qualityValue.textContent = qualityInput.value;
});

scaleChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    chip.classList.toggle("active");
    if (document.querySelectorAll(".scale-chip:not(.scale-chip-custom).active").length === 0) {
      chip.classList.add("active");
    }
  });
});

scaleCustomToggle.addEventListener("click", () => {
  scaleCustomToggle.classList.toggle("active");
  scaleCustomInput.classList.toggle("is-hidden", !scaleCustomToggle.classList.contains("active"));
  if (scaleCustomToggle.classList.contains("active")) {
    scaleCustomInput.focus();
  }
});

tabOriginals.addEventListener("click", () => switchTab("originals"));
tabConverted.addEventListener("click", () => switchTab("converted"));

function switchTab(tab) {
  const showOriginals = tab === "originals";
  tabOriginals.classList.toggle("active", showOriginals);
  tabConverted.classList.toggle("active", !showOriginals);
  tabContentOriginals.classList.toggle("is-hidden", !showOriginals);
  tabContentConverted.classList.toggle("is-hidden", showOriginals);
}

fileInput.addEventListener("change", () => {
  addFiles([...fileInput.files]);
  fileInput.value = "";
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  addFiles([...event.dataTransfer.files]);
});

clearBtn.addEventListener("click", () => {
  files = [];
  converted = [];
  results.innerHTML = "";
  renderFileList();
  updateConvertedUI();
  setStatus("");
  setProgress(null, null);
  updateButtons();
  switchTab("originals");
});

convertBtn.addEventListener("click", convertAll);
downloadZipBtn.addEventListener("click", downloadZip);

function addFiles(newFiles) {
  const images = newFiles.filter((file) => file.type.startsWith("image/") || isHeic(file));
  if (images.length === 0) {
    setStatus("No se encontraron imágenes válidas.");
    return;
  }

  for (const file of images) {
    const duplicate = files.some(
      (existing) =>
        existing.name === file.name &&
        existing.size === file.size &&
        existing.lastModified === file.lastModified,
    );
    if (!duplicate) {
      files.push(file);
    }
  }

  renderFileList();
  updateButtons();
  setStatus("");
  switchTab("originals");
}

function isHeic(file) {
  const name = file.name.toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatScaleLabel(scale) {
  return String(scale);
}

function webpName(filename, scale, useScaleSuffix) {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  if (!useScaleSuffix) {
    return `${base}.webp`;
  }
  return `${base}_${formatScaleLabel(scale)}x.webp`;
}

function getSelectedScales() {
  const scales = [];

  scaleChips.forEach((chip) => {
    if (chip.classList.contains("active")) {
      scales.push(parseFloat(chip.dataset.scale));
    }
  });

  if (scaleCustomToggle.classList.contains("active")) {
    const customValue = scaleCustomInput.value.trim();
    if (!customValue) {
      throw new Error("Ingresa un valor de escala custom.");
    }
    const customScale = parseFloat(customValue);
    if (Number.isNaN(customScale) || customScale <= 0) {
      throw new Error("La escala custom debe ser un número mayor que 0.");
    }
    scales.push(customScale);
  }

  if (scales.length === 0) {
    scales.push(1);
  }

  return [...new Set(scales)];
}

function renderFileList() {
  fileList.innerHTML = "";

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const item = document.createElement("div");
    item.className = "file-item";

    const thumb = document.createElement("img");
    thumb.className = "file-thumb";
    thumb.alt = "";
    thumb.src = URL.createObjectURL(file);

    const name = document.createElement("span");
    name.className = "file-name";
    name.textContent = file.name;

    const size = document.createElement("span");
    size.className = "file-size";
    size.textContent = formatSize(file.size);

    const remove = document.createElement("button");
    remove.className = "file-remove";
    remove.type = "button";
    remove.setAttribute("aria-label", `Quitar ${file.name}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      files.splice(index, 1);
      renderFileList();
      updateButtons();
    });

    item.append(thumb, name, size, remove);
    fileList.append(item);
  }

  updateUploadPanel();
  countOriginals.textContent = String(files.length);
}

function updateUploadPanel() {
  const panel = document.querySelector(".panel-upload");
  if (panel) {
    panel.classList.toggle("has-files", files.length > 0);
  }
}

function updateButtons() {
  const hasFiles = files.length > 0;
  convertBtn.disabled = !hasFiles;
  clearBtn.disabled = !hasFiles && converted.length === 0;
}

function setStatus(message, active = false) {
  statusBar.textContent = message;
  statusBar.classList.toggle("active", active);
}

function setProgress(done, total) {
  if (total === null) {
    progressBar.classList.add("is-hidden");
    progressFill.style.width = "0%";
    return;
  }
  progressBar.classList.remove("is-hidden");
  progressFill.style.width = `${Math.round((done / total) * 100)}%`;
}

function buildFormData(file, scale) {
  const form = new FormData();
  form.append("image", file);
  form.append("quality", qualityInput.value);
  form.append("scale", String(scale));

  const maxWidth = maxWidthInput.value.trim();
  const maxHeight = maxHeightInput.value.trim();
  if (maxWidth) form.append("maxWidth", maxWidth);
  if (maxHeight) form.append("maxHeight", maxHeight);
  if (isHeic(file)) form.append("format", "heic");

  return form;
}

async function convertFile(file, scale) {
  const response = await fetch("/convert", {
    method: "POST",
    headers: { Accept: "image/webp,image/*,*/*" },
    body: buildFormData(file, scale),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Error ${response.status}`);
  }

  const blob = await response.blob();
  return { blob, size: blob.size };
}

function addResult(file, scale, outcome, useScaleSuffix) {
  const item = document.createElement("div");
  item.className = `result-item ${outcome.ok ? "success" : "error"}`;

  const info = document.createElement("div");
  info.className = "result-info";

  const name = document.createElement("div");
  name.className = "result-name";

  const meta = document.createElement("div");
  meta.className = "result-meta";

  if (outcome.ok) {
    const outputName = webpName(file.name, scale, useScaleSuffix);
    name.textContent = outputName;
    meta.textContent = `${formatScaleLabel(scale)}× · ${formatSize(file.size)} → ${formatSize(outcome.size)}`;
    info.append(name, meta);
    item.append(info);

    const download = document.createElement("button");
    download.className = "btn-download";
    download.type = "button";
    download.textContent = "Descargar";
    download.addEventListener("click", () => {
      const url = URL.createObjectURL(outcome.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = outputName;
      link.click();
      URL.revokeObjectURL(url);
    });
    item.append(download);
  } else {
    name.textContent = file.name;
    meta.classList.add("error-text");
    meta.textContent = `${formatScaleLabel(scale)}× · ${outcome.error}`;
    info.append(name, meta);
    item.append(info);
  }

  results.append(item);
}

function updateConvertedUI() {
  countConverted.textContent = String(converted.length);
  downloadZipBtn.disabled = converted.length === 0;
  convertedEmpty.classList.toggle("is-hidden", results.children.length > 0);
}

function uniqueZipName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let counter = 2;
  let candidate = `${base}_${counter}${ext}`;
  while (usedNames.has(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}${ext}`;
  }
  usedNames.add(candidate);
  return candidate;
}

async function downloadZip() {
  if (converted.length === 0) return;

  if (typeof JSZip === "undefined") {
    setStatus("No se pudo cargar la librería ZIP. Revisa tu conexión.");
    return;
  }

  downloadZipBtn.disabled = true;
  setStatus("Generando ZIP…", true);

  try {
    const zip = new JSZip();
    const usedNames = new Set();
    for (const entry of converted) {
      zip.file(uniqueZipName(entry.name, usedNames), entry.blob);
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "webp-convertidas.zip";
    link.click();
    URL.revokeObjectURL(url);
    setStatus(`ZIP con ${converted.length} archivo${converted.length > 1 ? "s" : ""} descargado.`);
  } catch (error) {
    setStatus(`Error generando ZIP: ${error.message}`);
  } finally {
    downloadZipBtn.disabled = converted.length === 0;
  }
}

async function convertAll() {
  if (files.length === 0) return;

  let scales;
  try {
    scales = getSelectedScales();
  } catch (error) {
    setStatus(error.message);
    return;
  }

  convertBtn.disabled = true;
  clearBtn.disabled = true;
  results.innerHTML = "";
  converted = [];
  updateConvertedUI();

  const useScaleSuffix = scales.length > 1 || scales[0] !== 1;
  const jobs = files.flatMap((file) => scales.map((scale) => ({ file, scale })));
  let completed = 0;
  setProgress(0, jobs.length);

  for (const job of jobs) {
    setStatus(`Convirtiendo ${completed + 1} de ${jobs.length}…`, true);
    try {
      const result = await convertFile(job.file, job.scale);
      converted.push({
        name: webpName(job.file.name, job.scale, useScaleSuffix),
        blob: result.blob,
      });
      addResult(job.file, job.scale, { ok: true, blob: result.blob, size: result.size }, useScaleSuffix);
    } catch (error) {
      addResult(job.file, job.scale, { ok: false, error: error.message }, useScaleSuffix);
    }
    completed += 1;
    setProgress(completed, jobs.length);
    updateConvertedUI();
  }

  setProgress(null, null);
  const errors = results.querySelectorAll(".result-item.error").length;
  if (errors === 0) {
    setStatus(`${jobs.length} archivo${jobs.length > 1 ? "s" : ""} generado${jobs.length > 1 ? "s" : ""}.`);
  } else {
    setStatus(`${jobs.length - errors} ok, ${errors} con error.`);
  }

  updateButtons();
  switchTab("converted");
}

updateButtons();
updateConvertedUI();
