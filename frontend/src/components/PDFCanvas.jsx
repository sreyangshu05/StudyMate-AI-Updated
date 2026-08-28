import React from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

// Configure worker once per browser session, same-origin asset, on first load.
// (NOTE: pdfjs-dist's eval() is the known upstream caveat; not reachable through
// this render API and harmless at runtime — see PRODUCTION_READINESS.md.)
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `/${pdfjs.version}/pdf.worker.min.js`;
}

// The PDF canvas is loaded lazily via PDFViewer so the ~700kB pdf.js engine is
// fetched only when a user actually opens a PDF. Named imports here become the
// lazy module's default export.
const PDFCanvas = React.forwardRef(function PDFCanvas(
  { objectUrl, pageNumber, scale, rotation, highlightedPages, onPageClick, onLoadSuccess, onLoadError },
  ref
) {
  return (
    <Document
      file={objectUrl}
      onLoadSuccess={onLoadSuccess}
      onLoadError={onLoadError}
      loading={<div className="text-center py-8">Loading PDF...</div>}
    >
      <Page
        pageNumber={pageNumber}
        scale={scale}
        rotate={rotation}
        onClick={() => onPageClick && onPageClick(pageNumber)}
        className={`cursor-pointer transition-all duration-200 ${
          highlightedPages.includes(pageNumber) ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
        }`}
        renderTextLayer={false}
        renderAnnotationLayer={false}
      />
    </Document>
  );
});

export default PDFCanvas;
