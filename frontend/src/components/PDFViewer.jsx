import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { documentsAPI } from '../services/api';

// Lazy-load the PDF engine (react-pdf + bundled pdf.js, ~700kB) only when the
// user actually opens a PDF. This splits pdf.js out of the main bundle and
// kills the >500kB chunk warning: the first paint stays light, and the heavy
// chunk is fetched on demand, exactly once.
const PDFCanvas = lazy(() => import('./PDFCanvas'));

// Loads a PDF through the authenticated, ownership-scoped GET /api/documents/:id/file
// endpoint. The static /uploads mount was removed for security (IDOR), so files
// are always fetched with the Bearer token.
const PDFViewer = ({ docId, highlightedPages = [], onPageClick }) => {
  const [objectUrl, setObjectUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const revokeRef = useRef(null);

  const revoke = useCallback(() => {
    if (revokeRef.current) {
      URL.revokeObjectURL(revokeRef.current);
      revokeRef.current = null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setNumPages(null);
    setPageNumber(1);
    setObjectUrl(null);
    setError(null);

    if (!docId) {
      setLoading(false);
      return () => { alive = false; };
    }

    setLoading(true);
    revoke();
    (async () => {
      try {
        const url = await documentsAPI.getFileUrl(docId);
        if (!alive) { URL.revokeObjectURL(url); return; }
        revokeRef.current = url;
        setObjectUrl(url);
      } catch (e) {
        if (alive) setError('Could not load this PDF. It may still be processing or you may not own it.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [docId, revoke]);

  useEffect(() => () => revoke(), [revoke]);

  const onDocumentLoadSuccess = useCallback(({ numPages: n }) => {
    setNumPages(n);
    setLoading(false);
    setError(null);
  }, []);

  const onDocumentLoadError = useCallback(() => {
    setError('Failed to read the PDF file.');
    setLoading(false);
  }, []);

  const goToPrevPage = () => setPageNumber((prev) => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(prev + 1, numPages));
  const zoomIn = () => setScale((prev) => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.2, 0.5));
  const rotate = () => setRotation((prev) => (prev + 90) % 360);
  const goToPage = (page) => setPageNumber(Math.max(1, Math.min(page, numPages)));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg">
        <div className="text-center px-6">
          <p className="text-red-600 mb-4">{error}</p>
          {docId && (
            <button
              onClick={() => { setError(null); setLoading(true); documentsAPI.getFileUrl(docId).then(setObjectUrl).catch(() => setError('Retry failed')).finally(() => setLoading(false)); }}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!docId || !objectUrl) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No PDF selected</p>
          <p className="text-sm text-gray-500">Upload and select a PDF to view it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Controls */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <button onClick={goToPrevPage} disabled={pageNumber <= 1} aria-label="Previous page"
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm text-gray-700">Page {pageNumber} of {numPages || '-'}</span>
          <button onClick={goToNextPage} disabled={pageNumber >= numPages} aria-label="Next page"
            className="p-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={zoomOut} className="p-2 rounded-md hover:bg-gray-100" aria-label="Zoom out" title="Zoom Out"><ZoomOut className="h-5 w-5" /></button>
          <span className="text-sm text-gray-700 min-w-[3rem] text-center" aria-live="polite">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="p-2 rounded-md hover:bg-gray-100" aria-label="Zoom in" title="Zoom In"><ZoomIn className="h-5 w-5" /></button>
          <button onClick={rotate} className="p-2 rounded-md hover:bg-gray-100" aria-label="Rotate" title="Rotate"><RotateCw className="h-5 w-5" /></button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="overflow-auto max-h-[600px] p-4">
        <div className="flex justify-center" role="region" aria-label="PDF document viewer">
          <Suspense fallback={
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
              <p className="text-gray-600">Loading PDF engine...</p>
            </div>
          }>
            <PDFCanvas
              objectUrl={objectUrl}
              pageNumber={pageNumber}
              scale={scale}
              rotation={rotation}
              highlightedPages={highlightedPages}
              onPageClick={onPageClick}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
            />
          </Suspense>
        </div>
      </div>

      {/* Page Navigation */}
      {numPages > 1 && (
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-center space-x-2">
            <button onClick={() => goToPage(1)} disabled={pageNumber === 1} className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50">First</button>
            <button onClick={goToPrevPage} disabled={pageNumber === 1} className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50">Previous</button>
            <label>
              <span className="sr-only">Go to page</span>
              <input type="number" min="1" max={numPages} value={pageNumber}
                onChange={(e) => goToPage(parseInt(e.target.value))} className="w-16 px-2 py-1 text-sm border rounded text-center" />
            </label>
            <button onClick={goToNextPage} disabled={pageNumber === numPages} className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50">Next</button>
            <button onClick={() => goToPage(numPages)} disabled={pageNumber === numPages} className="px-3 py-1 text-sm border rounded hover:bg-gray-100 disabled:opacity-50">Last</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;
