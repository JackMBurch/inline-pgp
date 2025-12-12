// ==UserScript==
// @name         PGP Inline Decrypt for duckduckgo.com (file key + session PW + collapsible)
// @namespace    https://duckduckgo.com/
// @version      4.2.0
// @description  Detect PGP encrypted blocks on duckduckgo.com and decrypt/revert them inline using a file-loaded private key and session-stored passphrase.
// @match        https://duckduckgo.com/*
// @grant        none
// @run-at       document-end
// @require      https://unpkg.com/openpgp@5/dist/openpgp.min.js
// ==/UserScript==

(function () {
  'use strict';

  // Storage keys
  const SS_KEY_PRIVATE = 'pgpInlineDecrypt_privateKey'; // sessionStorage: armored private key
  const SS_KEY_PRIVATE_NAME = 'pgpInlineDecrypt_privateKeyName'; // sessionStorage: key filename
  const SS_KEY_PW = 'pgpInlineDecrypt_passphrase'; // sessionStorage: passphrase
  const LS_KEY_AUTO = 'pgpInlineDecrypt_auto'; // localStorage: auto-decrypt on/off

  const PGP_MESSAGE_REGEX =
    /-----BEGIN PGP MESSAGE-----[\s\S]+?-----END PGP MESSAGE-----/;

  let autoDecryptEnabled = window.localStorage.getItem(LS_KEY_AUTO) !== 'false'; // default: on

  function injectStyles() {
    const css = `
      #pgp-inline-decrypt-controls {
        position: fixed;
        top: 0.75rem;
        right: 0.75rem;
        z-index: 99999;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 0.75rem;
        color: #e5e7eb;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
      }
      #pgp-inline-decrypt-toggle {
        background: rgba(15, 23, 42, 0.98);
        border-radius: 999px;
        border: 1px solid rgba(55, 65, 81, 0.9);
        width: 2.1rem;
        height: 2.1rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 10px 25px rgba(0,0,0,0.45);
      }
      #pgp-inline-decrypt-toggle span {
        font-size: 1.1rem;
      }
      #pgp-inline-decrypt-panel {
        margin-top: 0.35rem;
        background: rgba(15, 23, 42, 0.98);
        border-radius: 0.6rem;
        padding: 0.55rem 0.75rem;
        border: 1px solid rgba(55, 65, 81, 0.9);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
        max-width: 260px;
      }
      #pgp-inline-decrypt-panel.collapsed {
        display: none;
      }
      #pgp-inline-decrypt-panel .title {
        font-weight: 600;
        margin-bottom: 0.25rem;
        font-size: 0.78rem;
      }
      #pgp-inline-decrypt-panel .row {
        display: flex;
        gap: 0.35rem;
        margin: 0.1rem 0 0.25rem;
      }
      #pgp-inline-decrypt-panel button.small-btn {
        padding: 0.25rem 0.6rem;
        font-size: 0.72rem;
        border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, 0.9);
        background: transparent;
        color: #e5e7eb;
        cursor: pointer;
        white-space: nowrap;
      }
      #pgp-inline-decrypt-panel button.small-btn:hover {
        border-color: #38bdf8;
      }
      #pgp-inline-decrypt-panel label {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        margin: 0.1rem 0;
        cursor: pointer;
      }
      #pgpAutoDecryptToggle {
        width: 0.85rem;
        height: 0.85rem;
      }
      #pgpPrivateKeyFile {
        display: none;
      }
      #pgpPrivateKeyStatus,
      #pgpPassphraseStatus {
        margin-top: 0.15rem;
        font-size: 0.72rem;
        color: #9ca3af;
      }
      #pgpPassphraseStatus {
        margin-bottom: 0.15rem;
      }
      #pgpClearSession {
        margin-top: 0.15rem;
        font-size: 0.7rem;
        opacity: 0.8;
      }
      #pgpClearSession:hover {
        opacity: 1;
      }
      .pgp-decoded-inline {
        background: rgba(251, 191, 36, 0.1);
        border-left: 3px solid rgba(250, 204, 21, 0.7);
        padding: 0.15rem 0.4rem;
        border-radius: 0.25rem;
        font-style: italic;
        display: inline-block;
      }
      .pgp-decoded-inline[title] {
        cursor: help;
      }
    `;
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function createControls() {
    const container = document.createElement('div');
    container.id = 'pgp-inline-decrypt-controls';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'pgp-inline-decrypt-toggle';
    toggleBtn.type = 'button';
    toggleBtn.title = 'PGP inline decrypt controls';
    toggleBtn.innerHTML = '<span>🔐</span>';

    const panel = document.createElement('div');
    panel.id = 'pgp-inline-decrypt-panel';
    panel.className = 'collapsed';
    panel.innerHTML = `
      <div class="title">PGP inline decrypt</div>
      <div class="row">
        <button id="pgpPrivateKeyButton" type="button" class="small-btn">
          Select private key…
        </button>
        <button id="pgpChangePassphraseButton" type="button" class="small-btn">
          Change passphrase
        </button>
      </div>
      <input id="pgpPrivateKeyFile" type="file" accept=".asc,.pgp,.gpg,.txt">
      <div id="pgpPrivateKeyStatus"></div>
      <div id="pgpPassphraseStatus"></div>
      <label>
        <input id="pgpAutoDecryptToggle" type="checkbox">
        <span>Auto-decrypt PGP</span>
      </label>
      <button id="pgpClearSession" type="button" class="small-btn">
        Clear session key &amp; passphrase
      </button>
    `;

    container.appendChild(toggleBtn);
    container.appendChild(panel);
    document.body.appendChild(container);

    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });

    const autoToggle = document.getElementById('pgpAutoDecryptToggle');
    const privateKeyFile = document.getElementById('pgpPrivateKeyFile');
    const privateKeyButton = document.getElementById('pgpPrivateKeyButton');
    const changePassButton = document.getElementById(
      'pgpChangePassphraseButton'
    );
    const privateKeyStatus = document.getElementById('pgpPrivateKeyStatus');
    const passphraseStatus = document.getElementById('pgpPassphraseStatus');
    const clearSessionButton = document.getElementById('pgpClearSession');

    if (autoToggle) {
      autoToggle.checked = autoDecryptEnabled;
      autoToggle.addEventListener('change', () => {
        autoDecryptEnabled = autoToggle.checked;
        window.localStorage.setItem(
          LS_KEY_AUTO,
          autoDecryptEnabled ? 'true' : 'false'
        );
        if (!autoDecryptEnabled) {
          revertAllDecoded();
        } else {
          revertAllDecoded();
          scanAll();
        }
      });
    }

    if (privateKeyButton && privateKeyFile && privateKeyStatus) {
      privateKeyButton.addEventListener('click', () => {
        privateKeyFile.click();
      });

      privateKeyFile.addEventListener('change', async () => {
        if (!privateKeyFile.files || !privateKeyFile.files[0]) {
          return;
        }
        const file = privateKeyFile.files[0];
        try {
          const text = await file.text();
          if (!text.includes('BEGIN PGP PRIVATE KEY BLOCK')) {
            privateKeyStatus.textContent =
              'Selected file is not a PGP private key.';
            return;
          }
          window.sessionStorage.setItem(SS_KEY_PRIVATE, text);
          window.sessionStorage.setItem(SS_KEY_PRIVATE_NAME, file.name);
          privateKeyStatus.textContent = `Loaded private key from: ${file.name}`;
          if (autoDecryptEnabled) {
            revertAllDecoded();
            scanAll();
          }
        } catch (err) {
          privateKeyStatus.textContent = 'Failed to read private key file.';
        }
      });

      const existingKey = window.sessionStorage.getItem(SS_KEY_PRIVATE);
      if (existingKey) {
        const storedName =
          window.sessionStorage.getItem(SS_KEY_PRIVATE_NAME) || 'this session';
        privateKeyStatus.textContent = `Private key loaded from: ${storedName}`;
      }
    }

    if (passphraseStatus) {
      const hasPw = !!window.sessionStorage.getItem(SS_KEY_PW);
      passphraseStatus.textContent = hasPw
        ? 'Passphrase set for this session.'
        : 'No passphrase set for this session.';
    }

    if (changePassButton && passphraseStatus) {
      changePassButton.addEventListener('click', () => {
        const entered = window.prompt(
          'Enter PGP private key passphrase (stored in this session only):'
        );
        if (entered === null) {
          return;
        }
        window.sessionStorage.setItem(SS_KEY_PW, entered);
        passphraseStatus.textContent = 'Passphrase set for this session.';
        if (autoDecryptEnabled) {
          revertAllDecoded();
          scanAll();
        }
      });
    }

    if (clearSessionButton && privateKeyStatus && passphraseStatus) {
      clearSessionButton.addEventListener('click', () => {
        window.sessionStorage.removeItem(SS_KEY_PRIVATE);
        window.sessionStorage.removeItem(SS_KEY_PRIVATE_NAME);
        window.sessionStorage.removeItem(SS_KEY_PW);
        privateKeyStatus.textContent = 'Session key & passphrase cleared.';
        passphraseStatus.textContent = 'No passphrase set for this session.';
        revertAllDecoded();
      });
    }
  }

  function findPgpMessage(text) {
    if (!text || !text.includes('-----BEGIN PGP')) {
      return null;
    }
    const match = text.match(PGP_MESSAGE_REGEX);
    return match ? match[0] : null;
  }

  function normalizeArmored(block) {
    return block.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  async function getPassphrase() {
    let stored = window.sessionStorage.getItem(SS_KEY_PW);
    if (!stored) {
      const entered = window.prompt(
        'Enter PGP private key passphrase (session only):'
      );
      if (entered === null) {
        throw new Error('Passphrase input cancelled');
      }
      stored = entered;
      window.sessionStorage.setItem(SS_KEY_PW, stored);
    }
    return stored;
  }

  async function buildDecryptionKey() {
    const armoredKey = window.sessionStorage.getItem(SS_KEY_PRIVATE);
    if (!armoredKey) {
      throw new Error('No private key loaded in this session.');
    }

    const privateKey = await openpgp.readPrivateKey({
      armoredKey,
    });

    let passphrase = '';
    try {
      passphrase = await getPassphrase();
    } catch {
      return privateKey;
    }

    if (!passphrase) {
      return privateKey;
    }

    return openpgp.decryptKey({
      privateKey,
      passphrase,
    });
  }

  async function decryptArmored(armored) {
    const decryptionKey = await buildDecryptionKey();
    const message = await openpgp.readMessage({
      armoredMessage: armored,
    });

    const decrypted = await openpgp.decrypt({
      message,
      decryptionKeys: decryptionKey,
    });

    return decrypted.data;
  }

  async function processElement(el) {
    if (!(el instanceof HTMLElement)) return;
    if (!autoDecryptEnabled) return;
    if (el.dataset.pgpDecoded === 'true') return;
    if (el.closest('#pgp-inline-decrypt-controls')) return;

    const text = el.innerText || el.textContent || '';
    const pgpBlock = findPgpMessage(text);
    if (!pgpBlock) return;

    el.dataset.pgpDecoded = 'true';
    el.dataset.pgpOriginal = el.innerHTML;

    const placeholder = document.createElement('span');
    placeholder.className = 'pgp-decoded-inline';
    placeholder.textContent = 'Decrypting PGP…';
    placeholder.title = 'Decrypting PGP message…';

    el.innerHTML = '';
    el.appendChild(placeholder);

    try {
      const normalized = normalizeArmored(pgpBlock);
      const decrypted = await decryptArmored(normalized);

      placeholder.textContent = decrypted;
      placeholder.title = 'Decrypted PGP message (inline)';
    } catch {
      placeholder.textContent = '[PGP decryption failed]';
      placeholder.title = 'Failed to decrypt PGP message';
    }
  }

  function revertAllDecoded() {
    const els = document.querySelectorAll('[data-pgp-original]');
    els.forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.innerHTML = el.dataset.pgpOriginal || el.innerHTML;
      delete el.dataset.pgpOriginal;
      delete el.dataset.pgpDecoded;
    });
  }

  function scanAll() {
    if (!autoDecryptEnabled) return;
    const candidates = document.querySelectorAll('p, pre, code');
    candidates.forEach((el) => {
      if (
        el instanceof HTMLElement &&
        (el.innerText || el.textContent || '').includes('-----BEGIN PGP')
      ) {
        void processElement(el);
      }
    });
  }

  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (!autoDecryptEnabled) return;
      for (const m of mutations) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = /** @type {HTMLElement} */ (node);
              if (el.closest('#pgp-inline-decrypt-controls')) {
                return;
              }
              if (
                ['P', 'PRE', 'CODE'].includes(el.tagName) &&
                (el.innerText || el.textContent || '').includes(
                  '-----BEGIN PGP'
                )
              ) {
                void processElement(el);
              } else {
                const inner = el.querySelectorAll('p, pre, code');
                inner.forEach((child) => {
                  const childTxt = child.innerText || child.textContent || '';
                  if (childTxt.includes('-----BEGIN PGP')) {
                    void processElement(child);
                  }
                });
              }
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  async function init() {
    injectStyles();
    createControls(); // icon and panel always created

    if (typeof openpgp === 'undefined') {
      console.warn(
        '[PGP inline decrypt] openpgp not available; decrypt disabled.'
      );
      return;
    }

    scanAll();
    setupMutationObserver();
  }

  onReady(init);
})();
