# Barcode Scanner

**Was:** `public_html/barcode/barcode.html`

## What it does

Decodes EAN-13, EAN-8, UPC-A, UPC-E, Code 128 and Code 39 from the device
camera using [QuaggaJS](https://github.com/serratus/quaggaJS), builds a list of
codes with quantities, and exports it as CSV.

## What changed

Already client-side — Quagga decodes in the page and no server was ever
involved. Refurbished:

- **Repeat scans increment a quantity.** The original appended a new row on
  every detection, so scanning ten identical items produced ten rows reading
  `1`. It also had no cross-scan deduplication beyond a 1-second lockout.
- **The camera can be stopped**, and is released automatically when the tab is
  hidden. The original started the stream on page load and never stopped it,
  so the camera stayed live (and warm) until the tab closed.
- **The list survives a reload** via `localStorage`.
- **CSV fields are quoted** per RFC 4180. The original joined cells with commas
  unconditionally, so any code containing a comma silently corrupted the file.
  A UTF-8 BOM is prepended so Excel opens it correctly.
- Camera-permission and HTTPS-only failures now produce a readable message
  rather than a bare `DOMException` in the console.
- Rows are editable and removable; a row can be added by hand.
- Optional scan beep, synthesised with WebAudio so no audio file ships.
