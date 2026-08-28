import React, { useState, useEffect } from 'react';
import SourceSelector from '../components/SourceSelector';
import PDFViewer from '../components/PDFViewer';
import ChatInterface from '../components/ChatInterface';
import { documentsAPI } from '../services/api';
import toast from 'react-hot-toast';

const Reader = () => {
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [highlightedPages, setHighlightedPages] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const handleDocumentSelect = (docIds) => {
    setSelectedDocIds(docIds);
    
    // Set the first selected document as the current PDF (loads via authenticated file endpoint)
    if (docIds.length > 0) {
      setCurrentDocId(docIds[0]);
    } else {
      setCurrentDocId(null);
    }
  };

  const handlePageClick = (pageNumber) => {
    // This could be used to highlight specific pages based on citations
    console.log('Page clicked:', pageNumber);
  };

  const handleCitationClick = (pageNumber) => {
    setHighlightedPages([pageNumber]);
    // Scroll to the specific page in the PDF viewer
    setTimeout(() => {
      setHighlightedPages([]);
    }, 3000);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">PDF Reader & Chat</h1>
        <p className="text-gray-600">Upload documents, read PDFs, and chat with AI about your content</p>
      </div>

      {/* Source Selector */}
      <SourceSelector
        onDocumentSelect={handleDocumentSelect}
        selectedDocIds={selectedDocIds}
      />

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PDF Viewer */}
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">PDF Viewer</h2>
          <PDFViewer
            docId={currentDocId}
            highlightedPages={highlightedPages}
            onPageClick={handlePageClick}
          />
        </div>

        {/* Chat Interface */}
        <div>
          <h2 className="text-lg font-medium text-gray-900 mb-4">AI Chat Assistant</h2>
          <ChatInterface
            selectedDocIds={selectedDocIds}
            onCitationClick={handleCitationClick}
          />
        </div>
      </div>

      {/* Document Information */}
      {selectedDocIds.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Selected Documents</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedDocIds.map(docId => {
              const doc = documents.find(d => d.id === docId);
              return doc ? (
                <div key={doc.id} className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900">{doc.title}</h4>
                  <p className="text-sm text-gray-500">{doc.pages} pages</p>
                  <p className="text-xs text-gray-400">
                    Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                  </p>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reader;
