(function (global) {
  const QRMaker = (global.QRMaker = global.QRMaker || {});

  const TYPES = [
    { id: "text", label: "Text", hint: "Plain notes, codes, or any message" },
    { id: "url", label: "URL", hint: "Open a website when scanned" },
    { id: "wifi", label: "Wi‑Fi", hint: "Share network name and password" },
    { id: "email", label: "Email", hint: "Start a message to an address" },
    { id: "phone", label: "Phone", hint: "Dial a number" },
    { id: "sms", label: "SMS", hint: "Open a text with a draft" },
    { id: "contact", label: "Contact", hint: "vCard for address books" },
    { id: "location", label: "Location", hint: "Drop a map pin" },
    { id: "event", label: "Event", hint: "Calendar appointment" },
    { id: "whatsapp", label: "WhatsApp", hint: "Chat link with optional text" },
  ];

  function required(value, label) {
    const text = String(value ?? "").trim();
    if (!text) throw new Error(`${label} is required.`);
    return text;
  }

  function escapeWifi(value) {
    return String(value).replace(/([\\;,:])/g, "\\$1");
  }

  function escapeVCard(value) {
    return String(value)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");
  }

  function foldIcal(line) {
    const bytes = unescape(encodeURIComponent(line));
    if (bytes.length <= 75) return line;
    const chunks = [];
    let rest = line;
    chunks.push(rest.slice(0, 75));
    rest = rest.slice(75);
    while (rest.length) {
      chunks.push(" " + rest.slice(0, 74));
      rest = rest.slice(74);
    }
    return chunks.join("\r\n");
  }

  function toIcalDate(localValue) {
    if (!localValue) return "";
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) throw new Error("Enter a valid date and time.");
    const pad = (n) => String(n).padStart(2, "0");
    return (
      date.getUTCFullYear() +
      pad(date.getUTCMonth() + 1) +
      pad(date.getUTCDate()) +
      "T" +
      pad(date.getUTCHours()) +
      pad(date.getUTCMinutes()) +
      pad(date.getUTCSeconds()) +
      "Z"
    );
  }

  function digitsOnly(value) {
    return String(value || "").replace(/[^\d+]/g, "");
  }

  function normalizeUrl(value) {
    const text = required(value, "URL");
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
    return `https://${text}`;
  }

  function encodeText(data) {
    const text = required(data.text, "Text");
    return { payload: text, filename: "qr-text" };
  }

  function encodeUrl(data) {
    const payload = normalizeUrl(data.url);
    return { payload, filename: "qr-url" };
  }

  function encodeWifi(data) {
    const ssid = required(data.ssid, "Network name");
    const security = data.security || "WPA";
    const hidden = data.hidden ? "true" : "false";
    let payload = `WIFI:T:${security};S:${escapeWifi(ssid)};`;
    if (security !== "nopass") {
      const password = required(data.password, "Password");
      payload += `P:${escapeWifi(password)};`;
    } else if (data.password) {
      payload += `P:${escapeWifi(data.password)};`;
    }
    payload += `H:${hidden};;`;
    return { payload, filename: `qr-wifi-${ssid}` };
  }

  function encodeEmail(data) {
    const to = required(data.to, "Email address");
    const params = new URLSearchParams();
    if (data.subject) params.set("subject", data.subject);
    if (data.body) params.set("body", data.body);
    const query = params.toString();
    return {
      payload: `mailto:${to}${query ? `?${query}` : ""}`,
      filename: "qr-email",
    };
  }

  function encodePhone(data) {
    const phone = required(digitsOnly(data.phone) || data.phone, "Phone number");
    return { payload: `tel:${phone}`, filename: "qr-phone" };
  }

  function encodeSms(data) {
    const phone = required(digitsOnly(data.phone) || data.phone, "Phone number");
    const message = String(data.message || "").trim();
    const payload = message ? `SMSTO:${phone}:${message}` : `SMSTO:${phone}`;
    return { payload, filename: "qr-sms" };
  }

  function encodeContact(data) {
    const first = String(data.first || "").trim();
    const last = String(data.last || "").trim();
    const full = String(data.full || "").trim() || [first, last].filter(Boolean).join(" ");
    if (!full && !data.phone && !data.email) {
      throw new Error("Add a name, phone, or email for the contact.");
    }
    const lines = ["BEGIN:VCARD", "VERSION:3.0"];
    if (first || last) lines.push(`N:${escapeVCard(last)};${escapeVCard(first)};;;`);
    if (full) lines.push(`FN:${escapeVCard(full)}`);
    if (data.org) lines.push(`ORG:${escapeVCard(data.org)}`);
    if (data.title) lines.push(`TITLE:${escapeVCard(data.title)}`);
    if (data.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(data.phone)}`);
    if (data.email) lines.push(`EMAIL:${escapeVCard(data.email)}`);
    if (data.url) lines.push(`URL:${escapeVCard(normalizeUrl(data.url))}`);
    if (data.address) lines.push(`ADR;TYPE=HOME:;;${escapeVCard(data.address)};;;;`);
    if (data.note) lines.push(`NOTE:${escapeVCard(data.note)}`);
    lines.push("END:VCARD");
    const namePart = (full || "contact").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return { payload: lines.join("\n"), filename: `qr-contact-${namePart}` };
  }

  function encodeLocation(data) {
    const lat = required(data.lat, "Latitude");
    const lng = required(data.lng, "Longitude");
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error("Latitude must be between -90 and 90.");
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("Longitude must be between -180 and 180.");
    }
    const query = String(data.query || "").trim();
    const payload = query
      ? `geo:${latitude},${longitude}?q=${encodeURIComponent(query)}`
      : `geo:${latitude},${longitude}`;
    return { payload, filename: "qr-location" };
  }

  function encodeEvent(data) {
    const title = required(data.title, "Event title");
    const start = required(data.start, "Start time");
    const dtStart = toIcalDate(start);
    const dtEnd = data.end ? toIcalDate(data.end) : "";
    if (data.end && new Date(data.end) < new Date(start)) {
      throw new Error("End time must be after the start time.");
    }
    const stamp = toIcalDate(new Date().toISOString().slice(0, 16));
    const lines = [
      "BEGIN:VEVENT",
      foldIcal(`SUMMARY:${title}`),
      `DTSTAMP:${stamp}`,
      `DTSTART:${dtStart}`,
    ];
    if (dtEnd) lines.push(`DTEND:${dtEnd}`);
    if (data.location) lines.push(foldIcal(`LOCATION:${data.location}`));
    if (data.description) lines.push(foldIcal(`DESCRIPTION:${data.description}`));
    lines.push("END:VEVENT");
    return { payload: lines.join("\r\n"), filename: "qr-event" };
  }

  function encodeWhatsapp(data) {
    const phone = required(digitsOnly(data.phone), "Phone number with country code");
    const number = phone.replace(/\D/g, "");
    if (number.length < 8) throw new Error("Enter a full number including country code.");
    const message = String(data.message || "").trim();
    const payload = message
      ? `https://wa.me/${number}?text=${encodeURIComponent(message)}`
      : `https://wa.me/${number}`;
    return { payload, filename: "qr-whatsapp" };
  }

  const ENCODERS = {
    text: encodeText,
    url: encodeUrl,
    wifi: encodeWifi,
    email: encodeEmail,
    phone: encodePhone,
    sms: encodeSms,
    contact: encodeContact,
    location: encodeLocation,
    event: encodeEvent,
    whatsapp: encodeWhatsapp,
  };

  function encode(type, data) {
    const encoder = ENCODERS[type];
    if (!encoder) throw new Error(`Unknown QR type: ${type}`);
    return encoder(data || {});
  }

  QRMaker.TYPES = TYPES;
  QRMaker.encode = encode;
})(window);
