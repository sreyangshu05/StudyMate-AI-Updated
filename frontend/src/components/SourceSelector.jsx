import React, { useState, useEffect } from 'react';
import { Upload, FileText, Trash2, RefreshCw } from 'lucide-react';
import { documentsAPI } from '../services/api';
import toast from 'react-hot-toast';

const SourceSelector = ({ onDocumentSelect, selectedDocIds = [] }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await documentsAPI.getAll();
      setDocuments(response.data.documents);
    } catch (error) {
      toast.error('Failed to fetch documents');
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', uploadTitle || file.name);

    try {
      const response = await documentsAPI.upload(formData);
      const { docId } = response.data;

      toast.success('PDF uploaded successfully! Processing...');

      // Kick off background ingest (acks 202 immediately), then poll until the
      // doc reaches READY or FAILED so the UI reflects the real outcome.
      await documentsAPI.ingest(docId);
      const maxTries = 120; // ~60s at 500ms
      let tries = 0;
      let ready = false;
      while (tries < maxTries) {
        tries += 1;
        try {
          const listResp = await documentsAPI.getAll();
          const doc = (listResp.data?.documents || []).find((d) => d.id === docId);
          if (!doc) break;
          if (doc.status === 'READY') { ready = true; break; }
          if (doc.status === 'FAILED') break;
        } catch { /* transient poll error, keep going */ }
        await new Promise((r) => setTimeout(r, 500));
      }

      if (ready) {
        toast.success('PDF processed and ready to use!');
      } else {
        toast.error('PDF processing did not complete. You can retry it below.');
      }
      setUploadTitle('');
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to upload PDF');
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await documentsAPI.delete(docId);
      toast.success('Document deleted successfully');
      fetchDocuments();
    } catch (error) {
      toast.error('Failed to delete document');
      console.error('Delete error:', error);
    }
  };

  const handleRetryDocument = async (docId) => {
    try {
      toast('Reprocessing document...');
      await documentsAPI.retry(docId);
      toast.success('Document reprocessed');
      fetchDocuments();
    } catch (error) {
      toast.error('Reprocessing failed');
      console.error('Retry error:', error);
    }
  };

  const handleDocumentToggle = (docId) => {
    const newSelectedIds = selectedDocIds.includes(docId)
      ? selectedDocIds.filter(id => id !== docId)
      : [...selectedDocIds, docId];
    
    onDocumentSelect(newSelectedIds);
  };

  const handleSelectAll = () => {
    const readyDocIds = documents
      .filter((doc) => (doc.status || 'UPLOADING').toUpperCase() === 'READY')
      .map((doc) => doc.id);

    if (selectedDocIds.length === readyDocIds.length && readyDocIds.every((id) => selectedDocIds.includes(id))) {
      onDocumentSelect([]);
    } else {
      onDocumentSelect(readyDocIds);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Source Documents</h3>
        <p className="mt-1 text-sm text-gray-500">
          Select PDFs to use for questions and answers
        </p>
      </div>

      <div className="p-6">
        {/* Upload Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload New PDF
          </label>
          <div className="flex space-x-4">
            <input
              type="text"
              placeholder="Document title (optional)"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Choose PDF'}
              <input
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Document List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">
              Available Documents ({documents.length})
            </h4>
            {documents.some((doc) => (doc.status || 'UPLOADING').toUpperCase() === 'READY') && (
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                {documents
                  .filter((doc) => (doc.status || 'UPLOADING').toUpperCase() === 'READY')
                  .every((doc) => selectedDocIds.includes(doc.id)) ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No documents uploaded yet</p>
              <p className="text-sm">Upload a PDF to get started</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {documents.map((doc) => {
                const status = (doc.status || 'UPLOADING').toUpperCase();
                const isReady = status === 'READY';
                const isFailed = status === 'FAILED';
                const isSelected = selectedDocIds.includes(doc.id);
                const statusStyles =
                  status === 'READY' ? 'bg-green-100 text-green-700'
                  : status === 'FAILED' ? 'bg-red-100 text-red-700'
                  : status === 'PROCESSING' ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600';
                return (
                  <div
                    key={doc.id}
                    className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                      isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                    } ${isReady ? 'cursor-pointer hover:border-gray-300' : ''}`}
                    onClick={() => isReady && handleDocumentToggle(doc.id)}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!isReady}
                        onChange={() => isReady && handleDocumentToggle(doc.id)}
                        aria-label={`Select ${doc.title}`}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles}`}>
                            {status.charAt(0) + status.slice(1).toLowerCase()}
                          </span>
                          {isReady && (
                            <span className="text-xs text-gray-500">
                              {doc.chunk_count ?? 0} chunks • {doc.pages ?? 0} pages
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {isFailed && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRetryDocument(doc.id); }}
                          className="text-gray-400 hover:text-blue-500 p-1"
                          aria-label={`Retry processing ${doc.title}`}
                          title="Retry processing"
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc.id);
                        }}
                        aria-label={`Delete ${doc.title}`}
                        className="text-gray-400 hover:text-red-500 p-1"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <div className="mt-4 flex justify-end">
          <button
            onClick={fetchDocuments}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export default SourceSelector;
