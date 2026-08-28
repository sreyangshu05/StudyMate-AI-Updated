# pdfjs-dist `eval("require")` — Analysis and Mitigation

## The finding

`pdfjs-dist/build/pdf.js` contains a call to `eval("require")` inside
`_setupFakeWorkerGlobal` (around line 1982 in the bundled build). Static
analysis tools and some bundler configurations flag this as a security
concern because `eval` can execute arbitrary code.

## Why it is not exploitable in StudyMate

1. **The code path is gated behind `isNodeJS`.** The `eval("require")` is
   inside a conditional that checks `isNodeJS && typeof require === 'function'`.
   `isNodeJS` is a build-time constant that is `false` in browser bundles. In
   the browser this branch is dead code — it is never reached.

2. **The PDF worker is not a "fake worker".** StudyMate configures a real web
   worker by setting `pdfjs.GlobalWorkerOptions.workerSrc` to a same-origin
   static asset (`/3.11.174/pdf.worker.min.js` in `PDFCanvas.jsx`). The
   `_setupFakeWorkerGlobal` path (the one containing the `eval`) is only used
   as a fallback when no worker is configured. Since a real worker is always
   configured, the fake-worker fallback never executes.

3. **The eval evaluates `require`, not user input.** Even in Node, the string
   passed to `eval` is the literal `"require"` — it resolves the CommonJS
   `require` function. It does not process any user-supplied or
   network-supplied data. There is no injection vector.

## Defense-in-depth: Content-Security-Policy

Regardless of the above, StudyMate enforces a strict CSP that **does not
include `unsafe-eval`** in `script-src`. This means even if a future change
accidentally made the eval path reachable in the browser, the browser would
block `eval()` and `new Function()` at runtime.

**Frontend (nginx.conf):**
```
Content-Security-Policy: default-src 'self';
  script-src 'self';
  worker-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  object-src 'none';
  base-uri 'none';
  frame-ancestors 'none';
  form-action 'self'
```

**Backend (security headers middleware):**
```
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'
```

The backend CSP is intentionally restrictive (`default-src 'none'`) because
the API serves JSON, not executable HTML. The frontend CSP allows only
same-origin scripts and workers, with inline styles permitted for the React
runtime and react-hot-toast notifications.

## Verification

- **Automated:** `test/security.test.js` asserts the CSP header is present on
  API responses and that it does **not** contain `unsafe-eval`.
- **Build:** The frontend production build (`bun run build`) completes cleanly
  with the pdfjs worker bundled as a same-origin static asset.
- **E2E:** The Playwright suite loads real PDFs in a real browser through the
  production build; the worker initializes and renders pages without CSP
  violations.

## Alternatives considered

- **Patching pdfjs-dist to remove the eval:** Not viable. The eval is in a
  third-party dependency; patching it would create a maintenance burden and
  diverge from upstream. The CSP approach is the standard, recommended
  mitigation and does not require modifying vendor code.
- **Switching to a different PDF library:** No benefit. The eval is a
  well-known artifact of pdfjs's Node compatibility layer and is not
  exploitable in browser usage. pdfjs-dist is the de facto standard PDF
  renderer for the web.
