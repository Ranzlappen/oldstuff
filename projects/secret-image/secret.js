/* ==========================================================================
   Secret Image
   Ported from public_html/test/index.php + test/image.php.

   The original held the passphrase in a PHP constant, set
   $_SESSION['authenticated'] on a match, and had image.php serve the file to
   authenticated sessions. It also unlocked itself for anyone whose URL merely
   *contained* the string "?12345?", and expired the session after 20 seconds.

   A static host has no session to check and will serve any file it holds, so
   reproducing that shape would put the picture at a fetchable URL behind a
   gate made of CSS. The file is encrypted instead — see NOTES.md.

   Parameters here must match tools/encrypt-secret.mjs, which produced
   secret.bin.
   ========================================================================== */
(function () {
  'use strict';

  var $ = window.Old.$;

  var ITERATIONS = 250000;
  var SALT_BYTES = 16;
  var IV_BYTES = 12;

  var objectUrl = null;

  function status(text, kind) {
    var node = $('#gate-status');
    node.className = 'small' + (kind ? ' si-' + kind : '');
    node.textContent = text;
  }

  /**
   * Derive the AES key from the passphrase and salt.
   * PBKDF2 is deliberately slow — 250,000 iterations takes a noticeable moment
   * in the browser, which is the point: it is the same moment an attacker pays
   * for every guess.
   */
  function deriveKey(passphrase, salt) {
    return crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']
    ).then(function (base) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: salt, iterations: ITERATIONS, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
    });
  }

  function unlock(passphrase) {
    if (!window.crypto || !crypto.subtle) {
      status('This browser has no WebCrypto, so the image cannot be decrypted. ' +
             'WebCrypto needs a secure context (HTTPS).', 'error');
      return;
    }

    $('#unlock').disabled = true;
    status('Deriving the key…', 'busy');

    fetch('secret.bin')
      .then(function (response) {
        if (!response.ok) throw new Error('could not load secret.bin (' + response.status + ')');
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        var salt = bytes.slice(0, SALT_BYTES);
        var iv = bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
        var payload = bytes.slice(SALT_BYTES + IV_BYTES);

        return deriveKey(passphrase, salt).then(function (key) {
          return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, payload);
        });
      })
      .then(function (plaintext) {
        // Reaching here means GCM's tag verified: the passphrase was right and
        // the ciphertext was not tampered with.
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(new Blob([plaintext], { type: 'image/webp' }));
        $('#secret').src = objectUrl;
        $('#gate').classList.add('hidden');
        $('#reveal').classList.remove('hidden');
        status('', '');
      })
      .catch(function (err) {
        // WebCrypto reports a failed tag as a bare OperationError with no
        // message, which is indistinguishable from a real fault — so tell the
        // two apart by whether the fetch got that far.
        if (err && /secret\.bin/.test(err.message || '')) {
          status(err.message, 'error');
        } else {
          status('That passphrase does not decrypt the image.', 'error');
        }
      })
      .then(function () { $('#unlock').disabled = false; });
  }

  $('#unlock-form').addEventListener('submit', function (event) {
    event.preventDefault();
    var passphrase = $('#passphrase').value;
    if (!passphrase) { status('Enter a passphrase.', 'error'); return; }
    unlock(passphrase);
  });

  $('#lock').addEventListener('click', function () {
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    $('#secret').removeAttribute('src');
    $('#reveal').classList.add('hidden');
    $('#gate').classList.remove('hidden');
    $('#passphrase').value = '';
    $('#passphrase').focus();
    status('', '');
  });
})();
