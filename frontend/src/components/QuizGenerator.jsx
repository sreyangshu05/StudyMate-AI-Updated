import React, { useState } from 'react';
import { Play, Settings, RotateCcw } from 'lucide-react';
import { quizAPI } from '../services/api';
import toast from 'react-hot-toast';

const QuizGenerator = ({ selectedDocIds, onQuizGenerated }) => {
  const [numQuestions, setNumQuestions] = useState(10);
  const [distribution, setDistribution] = useState({
    mcq: 6,
    saq: 3,
    laq: 1
  });
  const [generating, setGenerating] = useState(false);

  const handleDistributionChange = (type, value) => {
    const newDistribution = { ...distribution };
    newDistribution[type] = parseInt(value);
    
    // Ensure total doesn't exceed numQuestions
    const total = Object.values(newDistribution).reduce((sum, val) => sum + val, 0);
    if (total > numQuestions) {
      toast.error(`Total questions cannot exceed ${numQuestions}`);
      return;
    }
    
    setDistribution(newDistribution);
  };

  const handleNumQuestionsChange = (value) => {
    const newNum = parseInt(value);
    setNumQuestions(newNum);
    
    // Adjust distribution proportionally
    const total = Object.values(distribution).reduce((sum, val) => sum + val, 0);
    if (total > newNum) {
      const ratio = newNum / total;
      setDistribution({
        mcq: Math.round(distribution.mcq * ratio),
        saq: Math.round(distribution.saq * ratio),
        laq: Math.round(distribution.laq * ratio)
      });
    }
  };

  const generateQuiz = async () => {
    if (selectedDocIds.length === 0) {
      toast.error('Please select at least one document');
      return;
    }

    setGenerating(true);
    try {
      const response = await quizAPI.generate(selectedDocIds, numQuestions, distribution);
      toast.success('Quiz generated successfully!');
      onQuizGenerated(response.data);
    } catch (error) {
      toast.error('Failed to generate quiz');
      console.error('Quiz generation error:', error);
    } finally {
      setGenerating(false);
    }
  };

  const resetSettings = () => {
    setNumQuestions(10);
    setDistribution({ mcq: 6, saq: 3, laq: 1 });
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Generate Quiz</h3>
          <button
            onClick={resetSettings}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Create a custom quiz from your selected documents
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Number of Questions */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Number of Questions
          </label>
          <div className="flex items-center space-x-4">
            <input
              type="range"
              min="5"
              max="50"
              value={numQuestions}
              onChange={(e) => handleNumQuestionsChange(e.target.value)}
              className="flex-1"
            />
            <span className="text-sm font-medium text-gray-900 min-w-[3rem]">
              {numQuestions}
            </span>
          </div>
        </div>

        {/* Question Distribution */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Question Distribution
          </label>
          <div className="space-y-4">
            {/* MCQ */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-700">Multiple Choice (MCQ)</label>
                <p className="text-xs text-gray-500">Choose the correct answer</p>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="0"
                  max={numQuestions}
                  value={distribution.mcq}
                  onChange={(e) => handleDistributionChange('mcq', e.target.value)}
                  className="w-24"
                />
                <span className="text-sm font-medium text-gray-900 w-8">
                  {distribution.mcq}
                </span>
              </div>
            </div>

            {/* SAQ */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-700">Short Answer (SAQ)</label>
                <p className="text-xs text-gray-500">Brief written response</p>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="0"
                  max={numQuestions}
                  value={distribution.saq}
                  onChange={(e) => handleDistributionChange('saq', e.target.value)}
                  className="w-24"
                />
                <span className="text-sm font-medium text-gray-900 w-8">
                  {distribution.saq}
                </span>
              </div>
            </div>

            {/* LAQ */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-gray-700">Long Answer (LAQ)</label>
                <p className="text-xs text-gray-500">Detailed explanation required</p>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="range"
                  min="0"
                  max={numQuestions}
                  value={distribution.laq}
                  onChange={(e) => handleDistributionChange('laq', e.target.value)}
                  className="w-24"
                />
                <span className="text-sm font-medium text-gray-900 w-8">
                  {distribution.laq}
                </span>
              </div>
            </div>
          </div>

          {/* Total Check */}
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Questions:</span>
              <span className={`font-medium ${
                Object.values(distribution).reduce((sum, val) => sum + val, 0) === numQuestions
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {Object.values(distribution).reduce((sum, val) => sum + val, 0)} / {numQuestions}
              </span>
            </div>
          </div>
        </div>

        {/* Generate Button */}
        <div className="pt-4">
          <button
            onClick={generateQuiz}
            disabled={generating || selectedDocIds.length === 0}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Generating Quiz...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Generate Quiz
              </>
            )}
          </button>
          
          {selectedDocIds.length === 0 && (
            <p className="mt-2 text-sm text-red-600 text-center">
              Please select documents first
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuizGenerator;
