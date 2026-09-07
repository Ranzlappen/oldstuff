/* ==========================================================================
   zip.js — a minimal ZIP writer, ~100 lines, no dependencies.

   The Live HTML Editor's "save project" used to POST the code to
   save_project.php, which built a ZIP with PHP's ZipArchive and streamed it
   back. With no server, the archive has to be built in the page.

   Only the "stored" method (no compression) is implemented. That is a valid
   ZIP every unzip tool accepts, and for two small text files compression would
   save nothing worth the code. Pulling in a compression library for this would
   be a hundred kilobytes to save a hundred bytes.
   ========================================================================== */
(function () {
  'use strict';

  /** CRC-32, table-driven. The ZIP central directory requires it per entry. */
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /** Pack a Date into the DOS date/time pair ZIP headers use. */
  function dosTime(date) {
    return {
      time: ((date.getHours() & 31) << 11) |
            ((date.getMinutes() & 63) << 5) |
            ((date.getSeconds() / 2) & 31),
      date: (((date.getFullYear() - 1980) & 127) << 9) |
            (((date.getMonth() + 1) & 15) << 5) |
            (date.getDate() & 31)
    };
  }

  /** Little-endian writer over a growable byte array. */
  function Writer() {
    this.chunks = [];
    this.length = 0;
  }
  Writer.prototype.bytes = function (bytes) {
    this.chunks.push(bytes);
    this.length += bytes.length;
    return this;
  };
  Writer.prototype.u16 = function (value) {
    return this.bytes(new Uint8Array([value & 0xFF, (value >>> 8) & 0xFF]));
  };
  Writer.prototype.u32 = function (value) {
    return this.bytes(new Uint8Array([
      value & 0xFF, (value >>> 8) & 0xFF, (value >>> 16) & 0xFF, (value >>> 24) & 0xFF
    ]));
  };
  Writer.prototype.concat = function () {
    var out = new Uint8Array(this.length);
    var offset = 0;
    for (var i = 0; i < this.chunks.length; i++) {
      out.set(this.chunks[i], offset);
      offset += this.chunks[i].length;
    }
    return out;
  };

  /**
   * Build a ZIP from `{name: contents}`, where contents is a string or a
   * Uint8Array.
   *
   * @returns {Blob} application/zip
   */
  function zip(entries, when) {
    var encoder = new TextEncoder();
    var stamp = dosTime(when || new Date());
    var body = new Writer();
    var directory = new Writer();
    var count = 0;

    Object.keys(entries).forEach(function (name) {
      var value = entries[name];
      var data = typeof value === 'string' ? encoder.encode(value) : value;
      var nameBytes = encoder.encode(name);
      var crc = crc32(data);
      var offset = body.length;

      // Local file header.
      body.u32(0x04034B50)   // signature
          .u16(20)           // version needed (2.0)
          .u16(0x0800)       // flags: bit 11 marks the name as UTF-8
          .u16(0)            // method 0 = stored
          .u16(stamp.time).u16(stamp.date)
          .u32(crc)
          .u32(data.length)  // compressed size == uncompressed, stored
          .u32(data.length)
          .u16(nameBytes.length)
          .u16(0)            // extra field length
          .bytes(nameBytes)
          .bytes(data);

      // Central directory entry pointing back at that header.
      directory.u32(0x02014B50)
          .u16(20).u16(20).u16(0x0800).u16(0)
          .u16(stamp.time).u16(stamp.date)
          .u32(crc)
          .u32(data.length).u32(data.length)
          .u16(nameBytes.length)
          .u16(0)            // extra
          .u16(0)            // comment
          .u16(0)            // disk number
          .u16(0)            // internal attributes
          .u32(0)            // external attributes
          .u32(offset)
          .bytes(nameBytes);

      count++;
    });

    var directoryBytes = directory.concat();
    var end = new Writer();
    end.u32(0x06054B50)
       .u16(0).u16(0)                     // this disk / directory start disk
       .u16(count).u16(count)
       .u32(directoryBytes.length)
       .u32(body.length)
       .u16(0);                           // comment length

    return new Blob([body.concat(), directoryBytes, end.concat()],
      { type: 'application/zip' });
  }

  window.Old = window.Old || {};
  window.Old.zip = zip;
  window.Old.crc32 = crc32;
})();
