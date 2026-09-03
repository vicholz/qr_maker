(function (global) {
  const QRMaker = (global.QRMaker = global.QRMaker || {});

  function decodeImageData(imageData) {
    if (typeof jsQR !== "function") return null;
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return result && result.data ? result.data : null;
  }

  async function decodeWithBarcodeDetector(source) {
    if (!("BarcodeDetector" in window)) return null;
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const codes = await detector.detect(source);
      if (codes && codes.length && codes[0].rawValue) return codes[0].rawValue;
    } catch {
      return null;
    }
    return null;
  }

  function imageToCanvas(image) {
    const canvas = document.createElement("canvas");
    const width = image.naturalWidth || image.videoWidth || image.width;
    const height = image.naturalHeight || image.videoHeight || image.height;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, width, height);
    return { canvas, ctx };
  }

  async function decodeFromCanvas(canvas, ctx) {
    const detected = await decodeWithBarcodeDetector(canvas);
    if (detected) return detected;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return decodeImageData(imageData);
  }

  async function decodeFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Could not read that image."));
        img.src = url;
      });
      const { canvas, ctx } = imageToCanvas(image);
      const value = await decodeFromCanvas(canvas, ctx);
      if (!value) throw new Error("No QR code found in that image.");
      return value;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function createScanner(options) {
    const video = options.video;
    const onResult = options.onResult;
    const onError = options.onError || (() => {});
    const onStatus = options.onStatus || (() => {});
    let stream = null;
    let running = false;
    let frame = 0;
    const work = document.createElement("canvas");
    const ctx = work.getContext("2d", { willReadFrequently: true });

    async function tick() {
      if (!running) return;
      if (video.readyState >= 2) {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (width && height) {
          const maxEdge = 640;
          const scale = Math.min(1, maxEdge / Math.max(width, height));
          work.width = Math.round(width * scale);
          work.height = Math.round(height * scale);
          ctx.drawImage(video, 0, 0, work.width, work.height);
          try {
            const value = await decodeFromCanvas(work, ctx);
            if (value) {
              running = false;
              onResult(value);
              return;
            }
          } catch (error) {
            onError(error);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    }

    async function start(deviceId) {
      stop();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera access is not available in this browser.");
      }
      const constraints = deviceId
        ? { video: { deviceId: { exact: deviceId } }, audio: false }
        : { video: { facingMode: { ideal: "environment" } }, audio: false };
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      running = true;
      onStatus("Point the camera at a QR code.");
      tick();
    }

    function stop() {
      running = false;
      cancelAnimationFrame(frame);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
      }
      video.srcObject = null;
    }

    async function listCameras() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput");
    }

    return { start, stop, listCameras };
  }

  QRMaker.scanner = {
    createScanner,
    decodeFile,
  };
})(window);
