(function (global) {
  const QRMaker = (global.QRMaker = global.QRMaker || {});
  const DEFAULT_FG = "#0b0d10";
  const DEFAULT_BG = "#ffffff";
  const TEXT_FONT = "Arial, Helvetica, sans-serif";

  let measureCanvas;

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

  function measureContext() {
    if (!measureCanvas) measureCanvas = document.createElement("canvas");
    return measureCanvas.getContext("2d");
  }

  function captionStyle(kind, qrSize) {
    if (kind === "label") {
      return {
        size: Math.max(18, Math.round(qrSize * 0.078)),
        weight: 800,
        tracking: Math.max(1.5, qrSize * 0.014),
        family: TEXT_FONT,
      };
    }
    return {
      size: Math.max(13, Math.round(qrSize * 0.05)),
      weight: 700,
      tracking: 0,
      family: TEXT_FONT,
    };
  }

  function fontString(style) {
    return `${style.weight} ${style.size}px ${style.family}`;
  }

  function xmlEscape(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function measureTracked(ctx, text, style) {
    ctx.font = fontString(style);
    const chars = Array.from(text);
    if (!chars.length) return 0;
    return chars.reduce((sum, ch, index) => {
      return sum + ctx.measureText(ch).width + (index ? style.tracking : 0);
    }, 0);
  }

  function wrapText(ctx, text, style, maxWidth) {
    ctx.font = fontString(style);
    const raw = String(text ?? "");
    if (!raw) return [];
    if (measureTracked(ctx, raw, style) <= maxWidth) return [raw];

    const lines = [];
    let current = "";
    const flush = () => {
      if (current) lines.push(current);
      current = "";
    };
    const fits = (value) => measureTracked(ctx, value, style) <= maxWidth;

    for (const ch of raw) {
      const trial = current + ch;
      if (current && !fits(trial)) {
        flush();
        current = ch.trim() === ch ? ch : "";
        if (current && !fits(current)) {
          flush();
          current = ch;
        }
      } else {
        current = trial;
      }
    }
    flush();
    return lines.length ? lines : [raw];
  }

  function packBand(ctx, items, qrSize) {
    const list = Array.isArray(items) ? items.filter((item) => item && item.text) : [];
    if (!list.length) return { height: 0, lines: [], padY: 0 };
    const padX = Math.max(12, Math.round(qrSize * 0.055));
    const padY = Math.max(10, Math.round(qrSize * 0.042));
    const gap = Math.max(4, Math.round(qrSize * 0.016));
    const maxText = Math.max(40, qrSize - padX * 2);
    const lines = [];
    list.forEach((item, index) => {
      const style = captionStyle(item.kind, qrSize);
      wrapText(ctx, item.text, style, maxText).forEach((text) => {
        lines.push({ text, style, kind: item.kind });
      });
      if (index < list.length - 1) lines.push({ spacer: gap });
    });
    let height = padY;
    lines.forEach((line) => {
      if (line.spacer) height += line.spacer;
      else height += line.style.size * 1.28;
    });
    height += padY;
    return { height: Math.ceil(height), lines, padY, padX };
  }

  function layoutArtwork(payload, options) {
    const opts = options || {};
    const qrSize = opts.size || 320;
    const captions = opts.captions || {};
    const ctx = measureContext();
    const top = packBand(ctx, captions.above, qrSize);
    const bottom = packBand(ctx, captions.below, qrSize);
    const qr = makeModel(payload, opts.errorCorrection);
    const margin = Number.isFinite(opts.margin) ? opts.margin : 4;
    const { d, modules } = buildPath(qr, margin);
    return {
      qr,
      d,
      modules,
      dim: modules + margin * 2,
      margin,
      qrSize,
      cssWidth: qrSize,
      cssHeight: qrSize + top.height + bottom.height,
      top,
      bottom,
      fg: safeColor(opts.foreground, DEFAULT_FG),
      bg: safeColor(opts.background, DEFAULT_BG),
    };
  }

  function drawTrackedText(ctx, text, centerX, baselineY, style, fill) {
    ctx.fillStyle = fill;
    ctx.font = fontString(style);
    ctx.textBaseline = "alphabetic";
    if (!style.tracking) {
      ctx.textAlign = "center";
      ctx.fillText(text, centerX, baselineY);
      return;
    }
    ctx.textAlign = "left";
    const chars = Array.from(text);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((sum, width, index) => sum + width + (index ? style.tracking : 0), 0);
    let x = centerX - total / 2;
    chars.forEach((ch, index) => {
      ctx.fillText(ch, x, baselineY);
      x += widths[index] + style.tracking;
    });
  }

  function drawBand(ctx, band, originY, centerX, fill) {
    if (!band.height) return;
    let y = originY + band.padY;
    band.lines.forEach((line) => {
      if (line.spacer) {
        y += line.spacer;
        return;
      }
      y += line.style.size * 1.02;
      drawTrackedText(ctx, line.text, centerX, y, line.style, fill);
      y += line.style.size * 0.26;
    });
  }

  function drawQr(ctx, layout, originY) {
    const cell = layout.qrSize / layout.dim;
    ctx.fillStyle = layout.fg;
    for (let y = 0; y < layout.modules; y += 1) {
      for (let x = 0; x < layout.modules; x += 1) {
        if (!layout.qr.isDark(y, x)) continue;
        ctx.fillRect(
          (x + layout.margin) * cell,
          originY + (y + layout.margin) * cell,
          cell,
          cell
        );
      }
    }
  }

  function drawCanvas(canvas, payload, options) {
    const layout = layoutArtwork(payload, options);
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    canvas.width = Math.round(layout.cssWidth * dpr);
    canvas.height = Math.round(layout.cssHeight * dpr);
    canvas.style.width = `${layout.cssWidth}px`;
    canvas.style.height = `${layout.cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = layout.bg;
    ctx.fillRect(0, 0, layout.cssWidth, layout.cssHeight);
    drawBand(ctx, layout.top, 0, layout.cssWidth / 2, layout.fg);
    drawQr(ctx, layout, layout.top.height);
    drawBand(ctx, layout.bottom, layout.top.height + layout.qrSize, layout.cssWidth / 2, layout.fg);
    return layout;
  }

  function svgBand(band, originY, centerX, fill) {
    if (!band.height) return "";
    let y = originY + band.padY;
    let markup = "";
    band.lines.forEach((line) => {
      if (line.spacer) {
        y += line.spacer;
        return;
      }
      y += line.style.size * 1.02;
      const spacing = line.style.tracking
        ? ` letter-spacing="${line.style.tracking.toFixed(2)}"`
        : "";
      markup += `<text x="${centerX}" y="${y.toFixed(2)}" text-anchor="middle" fill="${fill}" font-family="${xmlEscape(
        line.style.family
      )}" font-size="${line.style.size}" font-weight="${line.style.weight}"${spacing}>${xmlEscape(line.text)}</text>`;
      y += line.style.size * 0.26;
    });
    return markup;
  }

  function toSvg(payload, options) {
    const layout = layoutArtwork(payload, options);
    const scale = layout.qrSize / layout.dim;
    const qrY = layout.top.height;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.cssWidth} ${layout.cssHeight}" width="${layout.cssWidth}" height="${layout.cssHeight}" shape-rendering="crispEdges">` +
      `<rect width="100%" height="100%" fill="${layout.bg}"/>` +
      svgBand(layout.top, 0, layout.cssWidth / 2, layout.fg) +
      `<g transform="translate(0 ${qrY}) scale(${scale})"><path fill="${layout.fg}" d="${layout.d}"/></g>` +
      svgBand(layout.bottom, qrY + layout.qrSize, layout.cssWidth / 2, layout.fg) +
      `</svg>`;
    return { svg, ...layout };
  }

  function slug(name) {
    return (
      String(name || "qr-code")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "qr-code"
    );
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
