import React, { useState, useEffect } from 'react';
import SourceSelector from '../components/SourceSelector';
import QuizGenerator from '../components/QuizGenerator';
import QuizInterface from '../components/QuizInterface';
import { documentsAPI, quizAPI } from '../services/api';
import toast from 'react-hot-toast';

const Quiz = () => {
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [currentQuiz, setCurrentQuiz] = useState(null);
  const [quizResults, setQuizResults] = useState(null);
  const [userQuizzes, setUserQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserQuizzes();
  }, []);

  const fetchUserQuizzes = async () => {
    try {
      const response = await quizAPI.getAll();
      setUserQuizzes(response.data.quizzes);
    } catch (error) {
      console.error('Error fetching quizzes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentSelect = (docIds) => {
    setSelectedDocIds(docIds);
  };

  const handleQuizGenerated = (quizData) => {
    setCurrentQuiz(quizData.quiz);
    setQuizResults(null);
  };

  const handleQuizComplete = (results) => {
    setQuizResults(results);
    fetchUserQuizzes(); // Refresh the quiz list
  };

  const handleStartNewQuiz = () => {
    setCurrentQuiz(null);
    setQuizResults(null);
  };

  const handleLoadQuiz = async (quizId) => {
    try {
      const response = await quizAPI.getById(quizId);
      setCurrentQuiz(response.data.quiz);
      setQuizResults(null);
    } catch (error) {
      toast.error('Failed to load quiz');
      console.error('Error loading quiz:', error);
    }
  };

  if (quizResults) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Quiz Results</h1>
          <button
            onClick={handleStartNewQuiz}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Start New Quiz
          </button>
        </div>

        {/* Results Summary */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center mb-6">
            <div className="text-4xl font-bold text-gray-900 mb-2">
              {quizResults.score}%
            </div>
            <p className="text-gray-600">
              {quizResults.correctAnswers} out of {quizResults.totalQuestions} correct
            </p>
          </div>

          {/* Performance Message */}
          <div className="text-center mb-6">
            {quizResults.score >= 80 ? (
              <div className="text-green-600">
                <p className="text-lg font-medium">Excellent work! 🎉</p>
                <p className="text-sm">You have a strong understanding of the material.</p>
              </div>
            ) : quizResults.score >= 60 ? (
              <div className="text-yellow-600">
                <p className="text-lg font-medium">Good job! 👍</p>
                <p className="text-sm">You're on the right track, keep practicing.</p>
              </div>
            ) : (
              <div className="text-red-600">
                <p className="text-lg font-medium">Keep studying! 📚</p>
                <p className="text-sm">Review the material and try again.</p>
              </div>
            )}
          </div>

          {/* Detailed Results */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-gray-900">Question Review</h3>
            {quizResults.results.map((result, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-medium ${
                    result.isCorrect ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${
                        result.isCorrect ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {result.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-gray-600">Your answer:</p>
                        <p className="text-sm font-medium">{result.userAnswer || 'No answer'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Correct answer:</p>
                        <p className="text-sm font-medium">{result.correctAnswer}</p>
                      </div>
                      {result.explanation && (
                        <div>
                          <p className="text-sm text-gray-600">Explanation:</p>
                          <p className="text-sm">{result.explanation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Quiz Generator</h1>
        <p className="text-gray-600">Create and take custom quizzes from your documents</p>
      </div>

      {!currentQuiz ? (
        <div className="space-y-6">
          {/* Source Selector */}
          <SourceSelector
            onDocumentSelect={handleDocumentSelect}
            selectedDocIds={selectedDocIds}
          />

          {/* Quiz Generator */}
          <QuizGenerator
            selectedDocIds={selectedDocIds}
            onQuizGenerated={handleQuizGenerated}
          />

          {/* Previous Quizzes */}
          {userQuizzes.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Previous Quizzes</h3>
                <p className="text-sm text-gray-500">Load and retake your previous quizzes</p>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {userQuizzes.map((quiz) => (
                    <div
                      key={quiz.id}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{quiz.name}</p>
                        <p className="text-sm text-gray-500">
                          Created {new Date(quiz.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleLoadQuiz(quiz.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Load Quiz
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <QuizInterface
          quiz={currentQuiz}
          onQuizComplete={handleQuizComplete}
        />
      )}
    </div>
  );
};

export default Quiz;
