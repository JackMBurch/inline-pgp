# Inline PGP Decryption

This repository contains a userscript that detects inline PGP-encrypted message blocks on a specific domain and decrypts them in place using a private key loaded from a local file and a passphrase stored in the browser session.

The script is designed to be used with browser userscript managers (such as Tampermonkey or Violentmonkey).

## Screenshots

<img width="535" alt="image" src="https://github.com/user-attachments/assets/c65ac38e-1198-4502-9cfa-6bcbf223a19f" />

## Files

- **`userscript.js`**: The main userscript. It is parameterized by a placeholder string `<domain>` which must be replaced with the actual target domain before use.
- **`configure.sh`**: Unix shell script that prompts for a domain and replaces all instances of `<domain>` in `userscript.js`.
- **`configure.bat`**: Windows batch script that performs the same replacement using PowerShell.

## Initial setup

From the project root (e.g. `/home/jack/repos/inline-pgp`):

1. **Configure the target domain**

   - On Linux/macOS:

     ```bash
     ./configure.sh
     ```

   - On Windows (from Command Prompt or PowerShell in this directory):

     ```bat
     configure.bat
     ```

   When prompted, enter the domain (for example `example.com`). All occurrences of `<domain>` in `userscript.js` will be replaced with your value.

2. **Install the userscript**

   - Open `userscript.js` in your browser.
   - Use your userscript manager (e.g. Tampermonkey/Violentmonkey) to create a new script and paste the contents of `userscript.js`, or drag/drop / import the file if supported.

## How it works (high level)

- Scans page content for `-----BEGIN PGP MESSAGE----- ... -----END PGP MESSAGE-----` blocks.
- Provides a small floating control panel to:
  - Load an armored private key file for the current browser session.
  - Set or change the passphrase (stored only in `sessionStorage`).
  - Toggle auto-decryption on and off.
  - Clear key and passphrase from the current session.
- Automatically replaces detected PGP blocks with decrypted plaintext (when possible), or shows a failure indicator if decryption fails.

## Development notes

- The userscript expects `openpgp` v5 to be available via the `@require` metadata line.
- The code avoids use of `any` in its JSDoc typings and aims to stay lint-clean; after modifying `userscript.js`, run your preferred linter in your environment if applicable.
