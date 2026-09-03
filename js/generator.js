(function (global) {
  const QRMaker = (global.QRMaker = global.QRMaker || {});

  function ensureUtf8() {
    if (typeof qrcode !== "function") {
      throw new Error("QR encoder failed to load.");
    }
    qrcode.stringToBytes = function stringToBytesUtf8(s) {
      const encoded = unescape(encodeURIComponent(s));
      const bytes = [];
      for (let i = 0; i < encoded.length; i += 1) bytes.push(encoded.charCodeAt(i));
      return bytes;
    };
  }

  function makeModel(payload, errorCorrection) {
    ensureUtf8();
    const qr = qrcode(0, errorCorrection || "M");
    qr.addData(payload, "Byte");
    qr.make();
    return qr;
  }

  function safeColor(value, fallback) {
    const color = String(value || "").trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return color;
    return fallback;
  }

  function buildPath(qr, margin) {
    const modules = qr.getModuleCount();
    let d = "";
    for (let y = 0; y < modules; y += 1) {
      for (let x = 0; x < modules; x += 1) {
        if (qr.isDark(y, x)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
      }
    }
    return { d, modules };
  }

  function toSvg(payload, options) {
    const opts = options || {};
    const qr = makeModel(payload, opts.errorCorrection);
    const margin = Number.isFinite(opts.margin) ? opts.margin : 4;
    const fg = safeColor(opts.foreground, "#0b0d10");
    const bg = safeColor(opts.background, "#f7f3ea");
    const { d, modules } = buildPath(qr, margin);
    const dim = modules + margin * 2;
    const size = opts.size || 320;
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path fill="${fg}" d="${d}"/></svg>`,
      modules,
      dim,
      qr,
    };
  }

  function drawCanvas(canvas, payload, options) {
    const opts = options || {};
    const built = toSvg(payload, opts);
    const ctx = canvas.getContext("2d");
    const size = opts.size || 320;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const cell = canvas.width / built.dim;
    const fg = safeColor(opts.foreground, "#0b0d10");
    const bg = safeColor(opts.background, "#f7f3ea");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = fg;
    const margin = Number.isFinite(opts.margin) ? opts.margin : 4;
    for (let y = 0; y < built.modules; y += 1) {
      for (let x = 0; x < built.modules; x += 1) {
        if (!built.qr.isDark(y, x)) continue;
        ctx.fillRect((x + margin) * cell, (y + margin) * cell, cell, cell);
      }
    }
    return built;
  }

  function slug(name) {
    return String(name || "qr-code")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "qr-code";
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadPng(canvas, filename) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Could not export PNG."));
          return;
        }
        downloadBlob(blob, `${slug(filename)}.png`);
        resolve();
      }, "image/png");
    });
  }

  function downloadSvg(svg, filename) {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `${slug(filename)}.svg`);
  }

  QRMaker.generator = {
    drawCanvas,
    toSvg,
    downloadPng,
    downloadSvg,
  };
})(window);
