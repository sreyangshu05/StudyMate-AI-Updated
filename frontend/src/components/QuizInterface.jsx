import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { quizAPI } from '../services/api';
import toast from 'react-hot-toast';

const QuizInterface = ({ quiz, onQuizComplete }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(30 * 60); // 30 minutes
  const [quizStarted, setQuizStarted] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const totalQuestions = quiz.questions.length;

  useEffect(() => {
    let interval;
    if (quizStarted && !quizCompleted && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            handleSubmitQuiz();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [quizStarted, quizCompleted, timeRemaining]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAnswerChange = (questionId, answer) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSubmitQuiz = async () => {
    if (submitting) return;
    
    setSubmitting(true);
    setQuizCompleted(true);
    
    try {
      const response = await quizAPI.submitAttempt(quiz.id, Object.values(answers));
      toast.success('Quiz submitted successfully!');
      onQuizComplete(response.data);
    } catch (error) {
      toast.error('Failed to submit quiz');
      console.error('Submit error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const startQuiz = () => {
    setQuizStarted(true);
  };

  if (!quiz) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <p className="text-gray-500">No quiz selected</p>
      </div>
    );
  }

  if (!quizStarted) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Ready to Start?</h3>
          <div className="space-y-4">
            <div className="text-sm text-gray-600">
              <p><strong>Quiz:</strong> {quiz.name}</p>
              <p><strong>Questions:</strong> {totalQuestions}</p>
              <p><strong>Time Limit:</strong> 30 minutes</p>
            </div>
            <button
              onClick={startQuiz}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Start Quiz
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (quizCompleted) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Submitting your quiz...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">{quiz.name}</h3>
            <p className="text-sm text-gray-500">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-sm text-gray-600">
              <Clock className="h-4 w-4 mr-1" />
              {formatTime(timeRemaining)}
            </div>
            <div className="w-32 bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-start space-x-3">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
              {currentQuestionIndex + 1}
            </span>
            <div className="flex-1">
              <h4 className="text-lg font-medium text-gray-900 mb-2">
                {currentQuestion.prompt_text}
              </h4>
              <p className="text-sm text-gray-500">
                Type: {currentQuestion.type} | Difficulty: {currentQuestion.difficulty}
              </p>
            </div>
          </div>
        </div>

        {/* Answer Options */}
        <div className="space-y-3">
          {currentQuestion.type === 'MCQ' && currentQuestion.choices ? (
            currentQuestion.choices.map((choice, index) => (
              <label
                key={index}
                className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  answers[currentQuestion.id] === choice
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`question-${currentQuestion.id}`}
                  value={choice}
                  checked={answers[currentQuestion.id] === choice}
                  onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className="ml-3 text-sm text-gray-900">{choice}</span>
              </label>
            ))
          ) : (
            <textarea
              value={answers[currentQuestion.id] || ''}
              onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
              placeholder={`Enter your ${currentQuestion.type === 'SAQ' ? 'short' : 'detailed'} answer here...`}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={currentQuestion.type === 'LAQ' ? 6 : 3}
            />
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrevQuestion}
            disabled={currentQuestionIndex === 0}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Previous
          </button>

          <div className="flex space-x-2">
            {quiz.questions.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentQuestionIndex(index)}
                className={`w-8 h-8 text-xs font-medium rounded-full ${
                  index === currentQuestionIndex
                    ? 'bg-blue-600 text-white'
                    : answers[quiz.questions[index].id]
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>

          {currentQuestionIndex === totalQuestions - 1 ? (
            <button
              onClick={handleSubmitQuiz}
              disabled={submitting}
              className="flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              Submit Quiz
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizInterface;
