#!/bin/bash
# Ingest all PDFs in /seed_pdfs/ via backend API
for f in ../seed_pdfs/*.pdf; do
  echo "Uploading $f..."
  curl -F "file=@$f" http://localhost:5000/api/upload
  # Optionally trigger ingest after upload
  # curl -X POST -H "Content-Type: application/json" -d '{"docId": ...}' http://localhost:5000/api/ingest
  echo "---"
done
