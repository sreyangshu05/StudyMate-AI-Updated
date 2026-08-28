import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Stub the API module; per-test behavior set on the returned mocks.
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

// react-hot-toast default export: called both as toast("...") and toast.error/success.
const toast = mock(() => {});
toast.error = mock(() => {});
toast.success = mock(() => {});
await mock.module('react-hot-toast', () => ({ default: toast }));

const SourceSelector = (await import('./SourceSelector.jsx')).default;

const mkDoc = (over = {}) => ({
  id: 1,
  title: 'Lecture 1.pdf',
  status: 'READY',
  chunk_count: 3,
  pages: 3,
  ...over,
});

describe('SourceSelector', () => {
  beforeEach(() => {
    Object.values(documentsAPI).forEach((m) => m.mockClear && m.mockClear());
  });

  it('shows the empty state when there are no documents', async () => {
    documentsAPI.getAll.mockResolvedValue({ data: { documents: [] } });
    render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [] }));
    await waitFor(() => {
      expect(screen.getByText(/No documents uploaded yet/i)).not.toBeNull();
    });
    expect(screen.getByText('Available Documents (0)')).not.toBeNull();
  });

  it('renders a status badge per document and only READY docs are selectable', async () => {
    documentsAPI.getAll.mockResolvedValue({
      data: {
        documents: [
          mkDoc({ id: 1, title: 'Ready Doc', status: 'READY', chunk_count: 5, pages: 4 }),
          mkDoc({ id: 2, title: 'Broken Doc', status: 'FAILED' }),
          mkDoc({ id: 3, title: 'Churning Doc', status: 'PROCESSING' }),
        ],
      },
    });

    const onSelect = mock(() => {});
    render(React.createElement(SourceSelector, { onDocumentSelect: onSelect, selectedDocIds: [] }));

    await waitFor(() => {
      expect(screen.getByText('Available Documents (3)')).not.toBeNull();
    });

    expect(screen.getByText('Ready')).not.toBeNull();
    expect(screen.getByText('Failed')).not.toBeNull();
    expect(screen.getByText('Processing')).not.toBeNull();

    // READY doc shows chunk/page metadata.
    expect(screen.getByText(/5 chunks/i)).not.toBeNull();

    // Clicking the READY row toggles selection via the callback (new id array).
    fireEvent.click(screen.getByText('Ready Doc'));
    expect(onSelect).toHaveBeenCalledWith([1]);
  });

  it('shows a retry control only for FAILED documents', async () => {
    documentsAPI.getAll.mockResolvedValue({
      data: {
        documents: [
          mkDoc({ id: 1, title: 'Ready Doc', status: 'READY' }),
          mkDoc({ id: 2, title: 'Broken Doc', status: 'FAILED' }),
        ],
      },
    });
    documentsAPI.retry.mockResolvedValue({ data: {} });

    render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [] }));

    await waitFor(() => expect(screen.getByText('Broken Doc')).not.toBeNull());

    const retryBtn = screen.getByTitle('Retry processing');
    expect(retryBtn).not.toBeNull();
    fireEvent.click(retryBtn);
    await waitFor(() => expect(documentsAPI.retry).toHaveBeenCalledWith(2));
    expect(screen.getAllByTitle('Retry processing').length).toBe(1);
  });

  it('selects only READY documents with Select All', async () => {
    documentsAPI.getAll.mockResolvedValue({
      data: {
        documents: [
          mkDoc({ id: 1, title: 'Ready Doc', status: 'READY' }),
          mkDoc({ id: 2, title: 'Processing Doc', status: 'PROCESSING' }),
        ],
      },
    });

    const onSelect = mock(() => {});
    render(React.createElement(SourceSelector, { onDocumentSelect: onSelect, selectedDocIds: [] }));

    await waitFor(() => expect(screen.getByText('Ready Doc')).not.toBeNull());
    fireEvent.click(screen.getByText('Select All'));
    expect(onSelect).toHaveBeenCalledWith([1]);
  });

  it('reflects the selected state via the passed selectedDocIds', async () => {
    documentsAPI.getAll.mockResolvedValue({
      data: { documents: [mkDoc({ id: 1, title: 'Picked Doc', status: 'READY' })] },
    });
    render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [1] }));
    await waitFor(() => expect(screen.getByText('Picked Doc')).not.toBeNull());
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.checked).toBe(true);
  });
});
