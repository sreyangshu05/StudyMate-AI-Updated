import React, { useState, useEffect } from 'react';
import SourceSelector from '../components/SourceSelector';
import ChatInterface from '../components/ChatInterface';
import { documentsAPI } from '../services/api';

const Chat = () => {
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const response = await documentsAPI.getAll();
      setDocuments(response.data.documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSelect = (docIds) => {
    setSelectedDocIds(docIds);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">AI Chat Assistant</h1>
        <p className="text-gray-600">Chat with AI about your documents and get intelligent answers</p>
      </div>

      {/* Source Selector */}
      <SourceSelector
        onDocumentSelect={handleDocumentSelect}
        selectedDocIds={selectedDocIds}
      />

      {/* Chat Interface */}
      <ChatInterface selectedDocIds={selectedDocIds} />

      {/* Document Context */}
      {selectedDocIds.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Chat Context</h3>
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              The AI assistant will use the following documents to provide context-aware answers:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {selectedDocIds.map(docId => {
                const doc = documents.find(d => d.id === docId);
                return doc ? (
                  <div key={doc.id} className="flex items-center space-x-3 p-3 bg-blue-50 rounded-lg">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                      <p className="text-xs text-gray-500">{doc.pages} pages</p>
                    </div>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        </div>
      )}

      {/* Chat Tips */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">💡 Chat Tips</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Ask specific questions:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• "What is Newton's second law?"</li>
              <li>• "Explain the concept of momentum"</li>
              <li>• "How do I solve quadratic equations?"</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Request explanations:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• "Can you explain this step by step?"</li>
              <li>• "What are the key points to remember?"</li>
              <li>• "Give me examples of this concept"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Chat;
