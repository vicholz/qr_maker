# QR Maker

A browser-only QR code creator and scanner. No build step, no server, no account.

Create codes for text, URLs, Wi‑Fi, email, phone, SMS, contacts, map pins, calendar events, and WhatsApp. Scan with a camera or by dropping in an image.

## Run it

Open `index.html`, or serve the folder so the camera can start:

```bash
python3 -m http.server 4173
```

Then visit [http://localhost:4173](http://localhost:4173).

Camera scanning needs a secure origin (`localhost` or HTTPS). Generating codes and decoding images works from the files themselves.

## Create

Pick a content type and fill the fields. The preview updates as you type.

| Type | Encoded as |
| --- | --- |
| Text | raw string |
| URL | `https://…` |
| Wi‑Fi | `WIFI:T:WPA;S:name;P:password;H:false;;` |
| Email | `mailto:` |
| Phone | `tel:` |
| SMS | `SMSTO:` |
| Contact | vCard 3.0 |
| Location | `geo:` |
| Event | `VEVENT` |
| WhatsApp | `https://wa.me/…` |

Download PNG or SVG, copy the payload, or copy the image. Error correction, quiet zone, size, and colors are adjustable.

## Scan

Start the camera or drop a screenshot. Recognized payloads are parsed into fields you can copy or open. Use **Edit as new QR** to load a scanned payload back into Create.

## Layout

```
index.html
css/styles.css
js/payloads.js      encode each content type
js/parser.js        turn scanned text into fields
js/generator.js     draw PNG / SVG
js/scanner.js       camera + image decode
js/app.js           UI
vendor/             qrcode-generator, jsQR
```

## License

MIT. Vendored libraries keep their own licenses; see `vendor/NOTICE.txt`.
