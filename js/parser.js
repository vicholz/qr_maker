(function (global) {
  const QRMaker = (global.QRMaker = global.QRMaker || {});

  function splitEscaped(text, delimiter) {
    const parts = [];
    let current = "";
    let escaped = false;
    for (const ch of text) {
      if (escaped) {
        current += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === delimiter) {
        parts.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    if (current || text.endsWith(delimiter)) parts.push(current);
    return parts;
  }

  function wifiFields(raw) {
    const body = raw.replace(/^WIFI:/i, "").replace(/;;\s*$/, ";");
    const parts = splitEscaped(body, ";");
    const map = {};
    for (const part of parts) {
      if (!part) continue;
      const idx = part.indexOf(":");
      if (idx === -1) continue;
      map[part.slice(0, idx).toUpperCase()] = part.slice(idx + 1);
    }
    return map;
  }

  function vcardFields(raw) {
    const lines = raw.replace(/\r\n/g, "\n").replace(/\n /g, "").split("\n");
    const fields = {};
    for (const line of lines) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx).split(";")[0].toUpperCase();
      const value = line.slice(idx + 1);
      if (!fields[key]) fields[key] = value;
    }
    return fields;
  }

  function mailtoFields(raw) {
    try {
      const url = new URL(raw);
      return {
        to: decodeURIComponent(url.pathname),
        subject: url.searchParams.get("subject") || "",
        body: url.searchParams.get("body") || "",
      };
    } catch {
      const text = raw.replace(/^mailto:/i, "");
      const [to, query = ""] = text.split("?");
      const params = new URLSearchParams(query);
      return {
        to,
        subject: params.get("subject") || "",
        body: params.get("body") || "",
      };
    }
  }

  function looksLikeUrl(text) {
    return /^(https?:\/\/|www\.)/i.test(text) || /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  }

  function parse(raw) {
    const text = String(raw ?? "");
    const trimmed = text.trim();
    if (!trimmed) {
      return { type: "empty", title: "Empty", summary: "No data", fields: [], raw: text };
    }

    if (/^WIFI:/i.test(trimmed)) {
      const wifi = wifiFields(trimmed);
      const security = wifi.T || "Unknown";
      const hidden = String(wifi.H || "").toLowerCase() === "true";
      return {
        type: "wifi",
        title: "Wi‑Fi network",
        summary: wifi.S || "Unnamed network",
        fields: [
          { label: "Network", value: wifi.S || "", copy: true },
          { label: "Security", value: security },
          { label: "Password", value: wifi.P || "", copy: true, secret: true },
          { label: "Hidden", value: hidden ? "Yes" : "No" },
        ],
        raw: trimmed,
      };
    }

    if (/^BEGIN:VCARD/i.test(trimmed)) {
      const card = vcardFields(trimmed);
      const name = card.FN || (card.N || "").split(";").filter(Boolean).join(" ");
      return {
        type: "contact",
        title: "Contact",
        summary: name || card.ORG || "vCard",
        fields: [
          { label: "Name", value: name },
          { label: "Organization", value: card.ORG || "" },
          { label: "Title", value: card.TITLE || "" },
          { label: "Phone", value: card.TEL || "", href: card.TEL ? `tel:${card.TEL}` : "" },
          { label: "Email", value: card.EMAIL || "", href: card.EMAIL ? `mailto:${card.EMAIL}` : "" },
          { label: "Website", value: card.URL || "", href: card.URL || "" },
          { label: "Address", value: (card.ADR || "").replace(/;+/g, ", ").replace(/^, |, $/g, "") },
          { label: "Note", value: card.NOTE || "" },
        ].filter((field) => field.value),
        raw: trimmed,
      };
    }

    if (/^BEGIN:(VEVENT|VCALENDAR)/i.test(trimmed)) {
      const card = vcardFields(trimmed);
      return {
        type: "event",
        title: "Calendar event",
        summary: card.SUMMARY || "Event",
        fields: [
          { label: "Title", value: card.SUMMARY || "" },
          { label: "Starts", value: card.DTSTART || "" },
          { label: "Ends", value: card.DTEND || "" },
          { label: "Location", value: card.LOCATION || "" },
          { label: "Description", value: card.DESCRIPTION || "" },
        ].filter((field) => field.value),
        raw: trimmed,
      };
    }

    if (/^MATMSG:/i.test(trimmed)) {
      const body = trimmed.replace(/^MATMSG:/i, "");
      const parts = splitEscaped(body, ";");
      const map = {};
      for (const part of parts) {
        const idx = part.indexOf(":");
        if (idx === -1) continue;
        map[part.slice(0, idx).toUpperCase()] = part.slice(idx + 1);
      }
      return {
        type: "email",
        title: "Email",
        summary: map.TO || "Message",
        fields: [
          { label: "To", value: map.TO || "", href: map.TO ? `mailto:${map.TO}` : "" },
          { label: "Subject", value: map.SUB || "" },
          { label: "Body", value: map.BODY || "" },
        ].filter((field) => field.value),
        raw: trimmed,
      };
    }

    if (/^mailto:/i.test(trimmed)) {
      const mail = mailtoFields(trimmed);
      return {
        type: "email",
        title: "Email",
        summary: mail.to || "Message",
        fields: [
          { label: "To", value: mail.to, href: mail.to ? `mailto:${mail.to}` : "" },
          { label: "Subject", value: mail.subject },
          { label: "Body", value: mail.body },
        ].filter((field) => field.value),
        raw: trimmed,
      };
    }

    if (/^(SMSTO|SMS):/i.test(trimmed)) {
      const rest = trimmed.replace(/^(SMSTO|SMS):/i, "");
      const idx = rest.indexOf(":");
      const phone = idx === -1 ? rest : rest.slice(0, idx);
      const message = idx === -1 ? "" : rest.slice(idx + 1);
      return {
        type: "sms",
        title: "SMS",
        summary: phone,
        fields: [
          { label: "Number", value: phone, href: `sms:${phone}` },
          { label: "Message", value: message, copy: true },
        ].filter((field) => field.value),
        raw: trimmed,
      };
    }

    if (/^tel:/i.test(trimmed)) {
      const phone = trimmed.replace(/^tel:/i, "");
      return {
        type: "phone",
        title: "Phone",
        summary: phone,
        fields: [{ label: "Number", value: phone, href: `tel:${phone}` }],
        raw: trimmed,
      };
    }

    if (/^geo:/i.test(trimmed)) {
      const rest = trimmed.replace(/^geo:/i, "");
      const [coords, queryString = ""] = rest.split("?");
      const [lat, lng] = coords.split(",");
      const params = new URLSearchParams(queryString);
      const query = params.get("q") || "";
      const maps = `https://maps.google.com/?q=${encodeURIComponent(query || `${lat},${lng}`)}`;
      return {
        type: "location",
        title: "Location",
        summary: query || `${lat}, ${lng}`,
        fields: [
          { label: "Latitude", value: lat },
          { label: "Longitude", value: lng },
          { label: "Query", value: query },
        ].filter((field) => field.value),
        href: maps,
        raw: trimmed,
      };
    }

    if (/wa\.me\//i.test(trimmed) || /api\.whatsapp\.com/i.test(trimmed)) {
      let url;
      try {
        url = new URL(trimmed);
      } catch {
        url = null;
      }
      const number = trimmed.match(/wa\.me\/(\d+)/i)?.[1] || "";
      const message = url ? url.searchParams.get("text") || "" : "";
      return {
        type: "whatsapp",
        title: "WhatsApp",
        summary: number ? `+${number}` : "Chat link",
        fields: [
          { label: "Number", value: number },
          { label: "Message", value: message },
        ].filter((field) => field.value),
        href: trimmed,
        raw: trimmed,
      };
    }

    if (looksLikeUrl(trimmed)) {
      const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed;
      return {
        type: "url",
        title: "Link",
        summary: trimmed,
        fields: [{ label: "URL", value: trimmed, href }],
        href,
        raw: trimmed,
      };
    }

    return {
      type: "text",
      title: "Text",
      summary: trimmed.slice(0, 80),
      fields: [{ label: "Content", value: trimmed, copy: true }],
      raw: trimmed,
    };
  }

  QRMaker.parse = parse;
})(window);
