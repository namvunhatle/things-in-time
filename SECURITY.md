# Security policy

This project promises that the operator cannot read your archive. A bug that breaks that promise matters more to us than any other bug.

## Reporting a vulnerability

Please report it privately through **GitHub → Security → Report a vulnerability** on this repository. Do not open a public issue.

Include:
- what an attacker can do;
- the steps to reproduce;
- the affected file or endpoint, if you know it.

Expect an acknowledgement within 7 days. Once a fix is deployed, we will credit you unless you prefer otherwise.

## In scope

- Anything that lets the server, its providers or a third party read archive contents, recovery keys, link secrets or viewer passwords.
- Ways to open an archive without the share link (including its `#secret`) **and** the password.
- Ways to edit an archive without its recovery key.
- Offline password guessing from data the server hands out before authentication.
- Bypassing rate limits, the upload quota, the CSP or the same-origin checks.
- Weaknesses in the cryptography in [`lib/archive-crypto.js`](lib/archive-crypto.js): KDF parameters, nonce reuse, AAD binding, key handling.
- XSS or script injection, which would defeat end-to-end encryption.

## Known limitations (not vulnerabilities)

These are documented in the [README](README.md#limits-you-should-know):

- Users must trust the JavaScript the site serves.
- Metadata (ids, timestamps, sizes, IPs in logs) is visible to the server.
- Archives in the old plaintext format (`version: 1`) stay readable by the server until their owner encrypts them.
- A lost recovery key cannot be recovered.

## Out of scope

- Denial of service and volumetric attacks.
- Findings that need a compromised device or browser, or physical access.
- Social engineering of the operator or of users.
- Reports produced only by automated scanners, without a working impact.

## Supported versions

Only the current `main` branch, deployed at https://things-in-time.vercel.app, is supported.
