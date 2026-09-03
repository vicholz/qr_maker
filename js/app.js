(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const state = {
    mode: "create",
    type: "text",
    payload: "",
    filename: "qr-code",
    lastResult: null,
  };

  const els = {
    modeButtons: $$("[data-mode]"),
    panels: $$("[data-panel]"),
    typeButtons: $$("[data-type]"),
    typeForms: $$("[data-type-form]"),
    liveFields: $$("[data-live]"),
    previewCanvas: $("#preview-canvas"),
    previewEmpty: $("#preview-empty"),
    payloadView: $("#payload-view"),
    payloadCount: $("#payload-count"),
    status: $("#status"),
    errorCorrection: $("#opt-ecc"),
    margin: $("#opt-margin"),
    size: $("#opt-size"),
    sizeValue: $("#opt-size-value"),
    foreground: $("#opt-fg"),
    background: $("#opt-bg"),
    downloadPng: $("#download-png"),
    downloadSvg: $("#download-svg"),
    copyPayload: $("#copy-payload"),
    copyImage: $("#copy-image"),
    scanVideo: $("#scan-video"),
    scanStage: $("#scan-stage"),
    cameraSelect: $("#camera-select"),
    startCamera: $("#start-camera"),
    stopCamera: $("#stop-camera"),
    fileInput: $("#scan-file"),
    dropZone: $("#drop-zone"),
    result: $("#scan-result"),
    history: $("#scan-history"),
    wifiSecurity: $("#wifi-security"),
    wifiPasswordWrap: $("#wifi-password-wrap"),
  };

  let scanner = null;
  let renderTimer = 0;
  const history = loadHistory();

  function setStatus(message, kind) {
    els.status.textContent = message || "";
    els.status.dataset.kind = kind || "";
  }

  function setMode(mode) {
    state.mode = mode;
    els.modeButtons.forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    els.panels.forEach((panel) => {
      panel.hidden = panel.dataset.panel !== mode;
    });
    if (mode !== "scan" && scanner) scanner.stop();
    if (mode === "scan") renderHistory();
    setStatus("");
  }

  function setType(type) {
    state.type = type;
    els.typeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.type === type);
    });
    els.typeForms.forEach((form) => {
      form.hidden = form.dataset.typeForm !== type;
    });
    render();
  }

  function collect() {
    const type = state.type;
    switch (type) {
      case "text":
        return { text: $("#text-body").value };
      case "url":
        return { url: $("#url-value").value };
      case "wifi":
        return {
          ssid: $("#wifi-ssid").value,
          security: $("#wifi-security").value,
          password: $("#wifi-password").value,
          hidden: $("#wifi-hidden").checked,
        };
      case "email":
        return {
          to: $("#email-to").value,
          subject: $("#email-subject").value,
          body: $("#email-body").value,
        };
      case "phone":
        return { phone: $("#phone-number").value };
      case "sms":
        return { phone: $("#sms-number").value, message: $("#sms-body").value };
      case "contact":
        return {
          first: $("#contact-first").value,
          last: $("#contact-last").value,
          org: $("#contact-org").value,
          title: $("#contact-title").value,
          phone: $("#contact-phone").value,
          email: $("#contact-email").value,
          url: $("#contact-url").value,
          address: $("#contact-address").value,
          note: $("#contact-note").value,
        };
      case "location":
        return {
          lat: $("#loc-lat").value,
          lng: $("#loc-lng").value,
          query: $("#loc-query").value,
        };
      case "event":
        return {
          title: $("#event-title").value,
          location: $("#event-location").value,
          start: $("#event-start").value,
          end: $("#event-end").value,
          description: $("#event-desc").value,
        };
      case "whatsapp":
        return { phone: $("#wa-number").value, message: $("#wa-message").value };
      default:
        return {};
    }
  }

  function options() {
    return {
      errorCorrection: els.errorCorrection.value,
      margin: Number(els.margin.value),
      size: Number(els.size.value),
      foreground: els.foreground.value,
      background: els.background.value,
    };
  }

  function clearPreview() {
    const ctx = els.previewCanvas.getContext("2d");
    ctx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
    els.previewCanvas.hidden = true;
    els.previewEmpty.hidden = false;
    els.payloadView.textContent = "Payload will appear here.";
    els.payloadCount.textContent = "0 characters";
    state.payload = "";
    $$(".js-needs-payload").forEach((node) => {
      node.disabled = true;
    });
  }

  function hasContent(type, data) {
    const filled = (value) => String(value || "").trim().length > 0;
    switch (type) {
      case "text":
        return filled(data.text);
      case "url":
        return filled(data.url);
      case "wifi":
        return filled(data.ssid) || filled(data.password);
      case "email":
        return filled(data.to) || filled(data.subject) || filled(data.body);
      case "phone":
        return filled(data.phone);
      case "sms":
        return filled(data.phone) || filled(data.message);
      case "contact":
        return ["first", "last", "org", "title", "phone", "email", "url", "address", "note"].some(
          (key) => filled(data[key])
        );
      case "location":
        return filled(data.lat) || filled(data.lng) || filled(data.query);
      case "event":
        return ["title", "location", "start", "end", "description"].some((key) => filled(data[key]));
      case "whatsapp":
        return filled(data.phone) || filled(data.message);
      default:
        return false;
    }
  }

  function render() {
    els.sizeValue.textContent = `${els.size.value} px`;
    const data = collect();
    if (!hasContent(state.type, data)) {
      clearPreview();
      setStatus("");
      return;
    }

    try {
      const encoded = QRMaker.encode(state.type, data);
      state.payload = encoded.payload;
      state.filename = encoded.filename;
      QRMaker.generator.drawCanvas(els.previewCanvas, encoded.payload, options());
      els.previewCanvas.hidden = false;
      els.previewEmpty.hidden = true;
      els.payloadView.textContent = encoded.payload;
      els.payloadCount.textContent = `${encoded.payload.length} character${
        encoded.payload.length === 1 ? "" : "s"
      }`;
      $$(".js-needs-payload").forEach((node) => {
        node.disabled = false;
      });
      setStatus("");
    } catch (error) {
      clearPreview();
      setStatus(error.message, "error");
    }
  }

  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, 60);
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
  }

  async function onCopyPayload() {
    if (!state.payload) return;
    await copyText(state.payload);
    setStatus("Payload copied.", "ok");
  }

  async function onCopyImage() {
    if (!state.payload) return;
    if (!navigator.clipboard || !window.ClipboardItem) {
      setStatus("Copy image is not supported in this browser.", "error");
      return;
    }
    const blob = await new Promise((resolve) => els.previewCanvas.toBlob(resolve, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setStatus("Image copied.", "ok");
  }

  async function onDownloadPng() {
    if (!state.payload) return;
    await QRMaker.generator.downloadPng(els.previewCanvas, state.filename);
    setStatus("PNG downloaded.", "ok");
  }

  function onDownloadSvg() {
    if (!state.payload) return;
    const { svg } = QRMaker.generator.toSvg(state.payload, options());
    QRMaker.generator.downloadSvg(svg, state.filename);
    setStatus("SVG downloaded.", "ok");
  }

  function toggleWifiPassword() {
    const open = els.wifiSecurity.value !== "nopass";
    els.wifiPasswordWrap.hidden = !open;
    if (!open) $("#wifi-password").value = "";
    scheduleRender();
  }

  function loadHistory() {
    try {
      return JSON.parse(sessionStorage.getItem("qr-maker-history") || "[]");
    } catch {
      return [];
    }
  }

  function saveHistory() {
    sessionStorage.setItem("qr-maker-history", JSON.stringify(history.slice(0, 8)));
  }

  function pushHistory(raw) {
    const parsed = QRMaker.parse(raw);
    history.unshift({
      raw,
      type: parsed.type,
      title: parsed.title,
      summary: parsed.summary,
      at: new Date().toISOString(),
    });
    if (history.length > 8) history.length = 8;
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    if (!history.length) {
      els.history.innerHTML = `<p class="muted">Scans from this session show up here.</p>`;
      return;
    }
    els.history.innerHTML = history
      .map(
        (item, index) => `
        <button class="history-item" type="button" data-history="${index}">
          <span class="badge">${escapeHtml(item.title)}</span>
          <span>${escapeHtml(item.summary)}</span>
        </button>`
      )
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderResult(raw) {
    const parsed = QRMaker.parse(raw);
    state.lastResult = parsed;
    const fields = parsed.fields
      .map((field) => {
        const value = escapeHtml(field.value);
        const actions = [];
        if (field.href) {
          actions.push(
            `<a class="text-link" href="${escapeHtml(field.href)}" target="_blank" rel="noopener">Open</a>`
          );
        }
        if (field.copy) {
          actions.push(
            `<button type="button" class="text-link" data-copy="${escapeHtml(field.value)}">Copy</button>`
          );
        }
        return `<div class="result-field">
          <dt>${escapeHtml(field.label)}</dt>
          <dd>
            <span class="${field.secret ? "secret" : ""}">${value}</span>
            <span class="field-actions">${actions.join("")}</span>
          </dd>
        </div>`;
      })
      .join("");

    const primary =
      parsed.href
        ? `<a class="btn btn-primary" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener">Open</a>`
        : "";

    els.result.hidden = false;
    els.result.innerHTML = `
      <div class="result-head">
        <span class="badge">${escapeHtml(parsed.title)}</span>
        <strong>${escapeHtml(parsed.summary)}</strong>
      </div>
      <dl class="result-fields">${fields}</dl>
      <pre class="payload-view">${escapeHtml(parsed.raw)}</pre>
      <div class="result-actions">
        ${primary}
        <button type="button" class="btn" data-copy-raw>Copy payload</button>
        <button type="button" class="btn" data-make-from-scan>Edit as new QR</button>
      </div>
    `;
  }

  async function populateCameras() {
    if (!scanner) return;
    try {
      const cameras = await scanner.listCameras();
      if (!cameras.length) {
        els.cameraSelect.hidden = true;
        return;
      }
      els.cameraSelect.hidden = false;
      const current = els.cameraSelect.value;
      els.cameraSelect.innerHTML = cameras
        .map((camera, index) => {
          const label = camera.label || `Camera ${index + 1}`;
          return `<option value="${escapeHtml(camera.deviceId)}">${escapeHtml(label)}</option>`;
        })
        .join("");
      if (current && cameras.some((camera) => camera.deviceId === current)) {
        els.cameraSelect.value = current;
      }
    } catch {
      els.cameraSelect.hidden = true;
    }
  }

  async function startCamera() {
    try {
      if (!scanner) {
        scanner = QRMaker.scanner.createScanner({
          video: els.scanVideo,
          onResult: (value) => {
            els.scanStage.classList.remove("is-live");
            els.startCamera.disabled = false;
            els.stopCamera.disabled = true;
            renderResult(value);
            pushHistory(value);
            setStatus("QR code scanned.", "ok");
          },
          onError: (error) => setStatus(error.message, "error"),
          onStatus: (message) => setStatus(message),
        });
      }
      await scanner.start(els.cameraSelect.value || undefined);
      els.scanStage.classList.add("is-live");
      els.startCamera.disabled = true;
      els.stopCamera.disabled = false;
      await populateCameras();
    } catch (error) {
      const message =
        error.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow access and try again."
          : error.message || "Could not start the camera.";
      setStatus(message, "error");
    }
  }

  function stopCamera() {
    if (scanner) scanner.stop();
    els.scanStage.classList.remove("is-live");
    els.startCamera.disabled = false;
    els.stopCamera.disabled = true;
    setStatus("Camera stopped.");
  }

  async function handleFile(file) {
    if (!file) return;
    try {
      const value = await QRMaker.scanner.decodeFile(file);
      if (scanner) scanner.stop();
      els.scanStage.classList.remove("is-live");
      els.startCamera.disabled = false;
      els.stopCamera.disabled = true;
      renderResult(value);
      pushHistory(value);
      setStatus("QR code read from image.", "ok");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function bind() {
    els.modeButtons.forEach((button) => {
      button.addEventListener("click", () => setMode(button.dataset.mode));
    });
    els.typeButtons.forEach((button) => {
      button.addEventListener("click", () => setType(button.dataset.type));
    });
    els.liveFields.forEach((field) => {
      field.addEventListener("input", scheduleRender);
      field.addEventListener("change", scheduleRender);
    });
    els.wifiSecurity.addEventListener("change", toggleWifiPassword);
    els.downloadPng.addEventListener("click", () => onDownloadPng().catch((error) => setStatus(error.message, "error")));
    els.downloadSvg.addEventListener("click", onDownloadSvg);
    els.copyPayload.addEventListener("click", () =>
      onCopyPayload().catch(() => setStatus("Could not copy payload.", "error"))
    );
    els.copyImage.addEventListener("click", () =>
      onCopyImage().catch(() => setStatus("Could not copy image.", "error"))
    );
    els.startCamera.addEventListener("click", startCamera);
    els.stopCamera.addEventListener("click", stopCamera);
    els.cameraSelect.addEventListener("change", () => {
      if (els.scanStage.classList.contains("is-live")) startCamera();
    });
    els.fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      handleFile(file);
      event.target.value = "";
    });

    ["dragenter", "dragover"].forEach((name) => {
      els.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        els.dropZone.classList.add("is-over");
      });
    });
    ["dragleave", "drop"].forEach((name) => {
      els.dropZone.addEventListener(name, (event) => {
        event.preventDefault();
        els.dropZone.classList.remove("is-over");
      });
    });
    els.dropZone.addEventListener("drop", (event) => {
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      handleFile(file);
    });

    els.result.addEventListener("click", async (event) => {
      const copyBtn = event.target.closest("[data-copy]");
      if (copyBtn) {
        await copyText(copyBtn.dataset.copy);
        setStatus("Copied.", "ok");
        return;
      }
      if (event.target.closest("[data-copy-raw]") && state.lastResult) {
        await copyText(state.lastResult.raw);
        setStatus("Payload copied.", "ok");
        return;
      }
      if (event.target.closest("[data-make-from-scan]") && state.lastResult) {
        setMode("create");
        setType("text");
        $("#text-body").value = state.lastResult.raw;
        scheduleRender();
        setStatus("Loaded scanned payload into Create.", "ok");
      }
    });

    els.history.addEventListener("click", (event) => {
      const item = event.target.closest("[data-history]");
      if (!item) return;
      const entry = history[Number(item.dataset.history)];
      if (entry) renderResult(entry.raw);
    });

    window.addEventListener("beforeunload", stopCamera);
  }

  bind();
  toggleWifiPassword();
  setMode("create");
  setType("text");
  renderHistory();
  clearPreview();
})();
