import { describe, it, expect, mock, beforeEach } from '../test/bunTest.js';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Prevent react-pdf's worker module from touching a real DOM worker.
await mock.module('react-pdf', () => ({
  Document: () => null,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: '3.11.174' },
}));

const documentsAPI = { getFileUrl: mock(() => Promise.resolve('blob:mock')) };
await mock.module('../services/api', () => ({ documentsAPI }));

const PDFViewer = (await import('./PDFViewer.jsx')).default;

describe('PDFViewer', () => {
  beforeEach(() => documentsAPI.getFileUrl.mockClear());

  it('renders the empty state without loading the PDF engine when no docId is given', () => {
    render(React.createElement(PDFViewer, { docId: null }));
    expect(screen.getByText(/No PDF selected/i)).not.toBeNull();
  });

  it('shows a loading state while the authenticated file fetch is in flight', () => {
    documentsAPI.getFileUrl.mockReturnValue(new Promise(() => {}));
    render(React.createElement(PDFViewer, { docId: 42 }));
    expect(screen.getByText(/Loading PDF/i)).not.toBeNull();
  });
});
