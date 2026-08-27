import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, HelpCircle, BarChart3, MessageSquare, Upload, Brain } from 'lucide-react';

const Home = () => {
  const features = [
    {
      icon: Upload,
      title: 'Upload PDFs',
      description: 'Upload your course materials and textbooks in PDF format',
      link: '/reader',
      color: 'blue'
    },
    {
      icon: Brain,
      title: 'AI-Powered Q&A',
      description: 'Ask questions and get intelligent answers with citations',
      link: '/reader',
      color: 'green'
    },
    {
      icon: HelpCircle,
      title: 'Generate Quizzes',
      description: 'Create custom quizzes with MCQ, SAQ, and LAQ questions',
      link: '/quiz',
      color: 'purple'
    },
    {
      icon: MessageSquare,
      title: 'Chat Assistant',
      description: 'Interactive chat to help with your studies',
      link: '/chat',
      color: 'orange'
    },
    {
      icon: BarChart3,
      title: 'Track Progress',
      description: 'Monitor your performance and identify areas for improvement',
      link: '/dashboard',
      color: 'red'
    },
    {
      icon: BookOpen,
      title: 'PDF Reader',
      description: 'Read and annotate your documents with AI assistance',
      link: '/reader',
      color: 'indigo'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to StudyMate AI
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
          Transform your study experience with AI-powered learning tools. 
          Upload PDFs, generate quizzes, and get intelligent answers to accelerate your learning.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            to="/reader"
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
          >
            Get Started
          </Link>
          <Link
            to="/dashboard"
            className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            View Dashboard
          </Link>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <Link
              key={index}
              to={feature.link}
              className="group bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow duration-200"
            >
              <div className={`inline-flex p-3 rounded-lg bg-${feature.color}-100 mb-4`}>
                <Icon className={`h-6 w-6 text-${feature.color}-600`} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-blue-600">
                {feature.title}
              </h3>
              <p className="text-gray-600 text-sm">
                {feature.description}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Quick Stats */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-8 text-white">
        <h2 className="text-2xl font-bold mb-6 text-center">Why Choose StudyMate AI?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-3xl font-bold mb-2">100%</div>
            <div className="text-blue-100">AI-Powered</div>
            <div className="text-sm text-blue-200">Advanced LLM integration</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold mb-2">Multi-Format</div>
            <div className="text-blue-100">Quiz Types</div>
            <div className="text-sm text-blue-200">MCQ, SAQ, LAQ support</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold mb-2">Real-time</div>
            <div className="text-blue-100">Progress Tracking</div>
            <div className="text-sm text-blue-200">Monitor your learning</div>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Getting Started
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-blue-600 font-bold">1</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Upload Documents</h3>
            <p className="text-gray-600 text-sm">
              Upload your PDF textbooks and course materials
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-green-600 font-bold">2</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Ask Questions</h3>
            <p className="text-gray-600 text-sm">
              Use the chat interface to ask questions about your documents
            </p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-purple-600 font-bold">3</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Take Quizzes</h3>
            <p className="text-gray-600 text-sm">
              Generate and take quizzes to test your knowledge
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
