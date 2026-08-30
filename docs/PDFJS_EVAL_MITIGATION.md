# pdfjs-dist `eval("require")` Analysis and Mitigation

## Summary

StudyMate uses `pdfjs-dist` through a lazy-loaded PDF viewer. The bundled PDF.js build includes a Node compatibility fallback that contains `eval("require")`. That pattern is a known artifact of the library, not a StudyMate-specific code path.

## Why it is not a browser exploit in this app

1. The `eval("require")` branch is part of the PDF.js Node fallback path.
2. The StudyMate frontend loads the PDF worker from the same origin instead of relying on the fake-worker fallback.
3. The evaluated string is the literal word `require`, not user input.
4. The app uses CSP headers that do not permit `unsafe-eval`.

## Current architecture

- The PDF viewer is lazy-loaded in the frontend.
- The viewer fetches documents through authenticated ownership-checked API routes.
- PDF rendering is isolated to the browser and does not execute server-side rendering logic.
- The backend serves only authenticated file access for owned documents.

## Security posture

### Frontend

The frontend CSP allows same-origin scripts and workers, but does not allow `unsafe-eval`.

### Backend

The backend security headers use a restrictive CSP suitable for API responses.

## What is verified locally

- The PDF extraction pipeline now passes local tests with the extraction fallback in place.
- The frontend build completes successfully.
- The security test suite checks for CSP headers and the absence of `unsafe-eval`.
- The document and chat routes enforce ownership checks in local tests.

## What is not fully verified

- A full production browser session against a deployed stack has not been re-run in this environment.
- Real provider-backed document/chat flows still depend on external AI service behavior.

## Operational note

This document should be treated as a security rationale for the current implementation, not as a formal third-party audit.

