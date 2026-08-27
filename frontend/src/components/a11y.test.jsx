import { describe, it, expect, mock } from 'bun:test';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import axe from 'axe-core';

// Stub the API so components render deterministically.
const documentsAPI = {
  getAll: mock(() => Promise.resolve({ data: { documents: [] } })),
  upload: mock(() => Promise.resolve({})),
  ingest: mock(() => Promise.resolve({})),
  retry: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  getById: mock(() => Promise.resolve({})),
  getFileUrl: mock(() => Promise.resolve('blob:mock')),
};
await mock.module('../services/api', () => ({ documentsAPI }));
const toast = mock(() => {}); toast.error = mock(() => {}); toast.success = mock(() => {});
await mock.module('react-hot-toast', () => ({ default: toast }));
await mock.module('react-pdf', () => ({
  Document: () => null, Page: () => null,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: '3.11.174' },
}));

const SourceSelector = (await import('./SourceSelector.jsx')).default;
const PDFViewer = (await import('./PDFViewer.jsx')).default;

async function axeClean(container) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
  });
  if (results.violations.length) {
    const summary = results.violations
      .map((v) => `${v.id}: ${v.description} (${v.nodes.length} nodes)`)
      .join('\n');
    throw new Error(`axe violations:\n${summary}`);
  }
  expect(results.violations.length).toBe(0);
}

describe('accessibility: SourceSelector', () => {
  it('has no axe violations in the empty state', async () => {
    documentsAPI.getAll.mockResolvedValue({ data: { documents: [] } });
    const { container } = render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [] }));
    await waitFor(() => expect(container.textContent).toContain('No documents uploaded'));
    await axeClean(container);
  });

  it('has no axe violations with a document list (icon-only buttons need labels)', async () => {
    documentsAPI.getAll.mockResolvedValue({
      data: { documents: [
        { id: 1, title: 'Doc A', status: 'READY', chunk_count: 3, pages: 2 },
        { id: 2, title: 'Doc B', status: 'FAILED' },
      ] },
    });
    const { container } = render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [] }));
    await waitFor(() => expect(container.textContent).toContain('Doc A'));
    await axeClean(container);
  });
});

describe('accessibility: PDFViewer', () => {
  it('has no axe violations in the no-pdf state', async () => {
    const { container } = render(React.createElement(PDFViewer, { docId: null }));
    await waitFor(() => expect(container.textContent).toContain('No PDF selected'));
    await axeClean(container);
  });
});
