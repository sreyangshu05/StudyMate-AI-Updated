import React, { useState, useEffect } from 'react';
import { BookOpen, Target, Clock, Award, Flame, FileText, TrendingUp } from 'lucide-react';
import { statsAPI } from '../services/api';

// Pure helper: turn [{date, avgScore}] into an SVG polyline path.
function buildLinePath(points, w, h, pad) {
  if (points.length < 2) return null;
  const min = Math.min(...points.map((p) => p.avgScore));
  const max = Math.max(...points.map((p) => p.avgScore));
  const span = (max - min) || 1;
  const stepX = (w - pad * 2) / (points.length - 1);
  return points.map((p, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((p.avgScore - min) / span) * (h - pad * 2);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await statsAPI.getStats();
        if (alive) setStats(res.data);
      } catch (e) {
        if (alive) setError('Could not load your learning stats.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-lg shadow h-28"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-red-600">{error}</div>
    );
  }

  const s = stats || {};
  const concepts = s.conceptPerformance || {};
  const strengths = concepts.strengths || [];
  const weaknesses = concepts.weaknesses || [];
  const history = s.progressHistory || [];
  const difficulty = s.difficultyPerformance || [];

  const StatCard = ({ title, value, icon: Icon, color, subtitle }) => (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex items-center">
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">Your real performance, computed from your attempts</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Quizzes Taken" value={s.quizzesTaken ?? 0} icon={BookOpen} color="bg-blue-500" subtitle={`${s.documentsCount ?? 0} documents saved`} />
        <StatCard title="Average Score" value={`${s.avgScore ?? 0}%`} icon={Target} color="bg-green-500" subtitle="Across all attempts" />
        <StatCard title="Total Attempts" value={s.totalAttempts ?? 0} icon={Clock} color="bg-purple-500" subtitle="Practice sessions" />
        <StatCard title="Best Score" value={`${s.bestScore ?? 0}%`} icon={Award} color="bg-amber-500" subtitle={s.studyStreak ? `${s.studyStreak}-day streak` : 'No streak yet'} />
      </div>

      {/* Progress over time (real SVG line chart) */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Progress Over Time</h2>
            <p className="text-sm text-gray-500">Average score by day, last 30 days</p>
          </div>
          {history.length > 0 && (
            <span className="text-xs text-gray-500">{history.length} day(s) with attempts</span>
          )}
        </div>
        <div className="p-6">
          {history.length >= 2 ? (
            <div>
              <svg viewBox="0 0 600 220" className="w-full h-48" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polygon
                  points={`${'80,200 '}${history.map((p, i) => {
                    const stepX = 520 / (history.length - 1);
                    const mn = Math.min(...history.map((x) => x.avgScore));
                    const mx = Math.max(...history.map((x) => x.avgScore));
                    const span = (mx - mn) || 1;
                    return `${(80 + i * stepX).toFixed(1)},${(200 - ((p.avgScore - mn) / span) * 160).toFixed(1)}`;
                  }).join(' ')} 600,200`.replace('  ', ' ')}
                  fill="url(#area)"
                />
                <polyline
                  points={buildLinePath(history.map((p) => ({ avgScore: p.avgScore })), 600, 220, 40)}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {history.map((p, i) => {
                  const stepX = 520 / (history.length - 1);
                  const mn = Math.min(...history.map((x) => x.avgScore));
                  const mx = Math.max(...history.map((x) => x.avgScore));
                  const span = (mx - mn) || 1;
                  const x = 80 + i * stepX;
                  const y = 200 - ((p.avgScore - mn) / span) * 160;
                  return <circle key={i} cx={x} cy={y} r="4" fill="#3b82f6" />;
                })}
              </svg>
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>{history[0].date}</span>
                <span>{history[history.length - 1].date}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-10 text-gray-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No progress data yet.</p>
              <p className="text-sm">Complete quizzes to track your performance.</p>
            </div>
          )}
        </div>
      </div>

      {/* Difficulty performance */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Performance by Difficulty</h2>
          <p className="text-sm text-gray-500">Accuracy per question difficulty</p>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          {['easy', 'medium', 'hard'].map((level) => {
            const d = difficulty.find((x) => x.difficulty === level) || { accuracy: 0, attempts: 0 };
            return (
              <div key={level} className="text-center">
                <p className="text-sm font-medium text-gray-700 capitalize">{level}</p>
                <div className="mt-2 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${level === 'easy' ? 'bg-green-500' : level === 'medium' ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.max(d.accuracy, 4)}%` }}
                  />
                </div>
                <p className="mt-1 text-sm font-semibold text-gray-900">{d.accuracy}%</p>
                <p className="text-xs text-gray-500">{d.attempts} questions attempted</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Concept-level strengths and weaknesses (real, from attempt results) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-medium text-green-600">Topic Strengths</h2>
            <p className="text-sm text-gray-500">Concepts with ≥70% accuracy</p>
          </div>
          <div className="p-6">
            {strengths.length > 0 ? (
              <div className="space-y-3">
                {strengths.map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.topic}</p>
                      <p className="text-xs text-gray-500">{c.attempts} questions</p>
                    </div>
                    <span className="text-sm font-medium text-green-600">{c.accuracy}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Answer more questions to find strengths.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-medium text-red-600">Areas for Improvement</h2>
            <p className="text-sm text-gray-500">Concepts under 60% accuracy</p>
          </div>
          <div className="p-6">
            {weaknesses.length > 0 ? (
              <div className="space-y-3">
                {weaknesses.map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{c.topic}</p>
                      <p className="text-xs text-gray-500">{c.attempts} questions</p>
                    </div>
                    <span className="text-sm font-medium text-red-600">{c.accuracy}%</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">Great job, no weak concepts right now!</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent attempts */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Recent Attempts</h2>
        </div>
        <div className="p-6">
          {s.recentAttempts && s.recentAttempts.length > 0 ? (
            <div className="space-y-3">
              {s.recentAttempts.slice(0, 6).map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{a.quiz_name}</p>
                    <p className="text-xs text-gray-500">
                      {a.correct_count}/{a.total_questions} correct • {new Date(a.finished_at + (a.finished_at.includes('Z') ? '' : 'Z')).toLocaleString()}
                    </p>
                  </div>
                  <span className={`text-sm font-semibold ${a.score >= 70 ? 'text-green-600' : a.score >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{a.score}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Flame className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p>No attempts yet. Take your first quiz to see activity here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
