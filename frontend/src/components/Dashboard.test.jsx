import { describe, it, expect, mock, beforeEach } from '../test/bunTest.js';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Module mock: statsAPI.getStats is stubbed per-test below.
const getStats = mock(() => Promise.resolve({ data: {} }));
await mock.module('../services/api', () => ({
  statsAPI: { getStats },
}));

// Import AFTER the mock is registered so the component sees the stub.
const Dashboard = (await import('./Dashboard.jsx')).default;

describe('Dashboard', () => {
  beforeEach(() => getStats.mockClear());

  it('renders loading skeletons before stats resolve', () => {
    getStats.mockReturnValue(new Promise(() => {}));
    render(React.createElement(Dashboard));
    expect(screen.queryByText('Dashboard')).toBeNull();
  });

  it('renders stat cards from real API data once resolved', async () => {
    getStats.mockResolvedValue({
      data: {
          quizzesTaken: 7,
          avgScore: 82,
          totalAttempts: 12,
          bestScore: 95,
          studyStreak: 3,
          documentsCount: 4,
          progressHistory: [
            { date: '2026-08-25', avgScore: 70 },
            { date: '2026-08-26', avgScore: 82 },
            { date: '2026-08-27', avgScore: 95 },
          ],
          difficultyPerformance: [
            { difficulty: 'easy', accuracy: 90, attempts: 5 },
            { difficulty: 'hard', accuracy: 40, attempts: 3 },
          ],
          conceptPerformance: {
            strengths: [{ topic: 'Algebra', accuracy: 88, attempts: 6 }],
            weaknesses: [{ topic: 'Calculus', accuracy: 45, attempts: 4 }],
          },
        },
    });

    render(React.createElement(Dashboard));
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).not.toBeNull();
    });

    expect(screen.getByText('Quizzes Taken')).not.toBeNull();
    expect(screen.getByText('7')).not.toBeNull();
    expect(screen.getByText('Average Score')).not.toBeNull();
    expect(screen.getByText('82%')).not.toBeNull();
    expect(screen.getByText('Total Attempts')).not.toBeNull();
    expect(screen.getByText('12')).not.toBeNull();
    expect(screen.getByText('Best Score')).not.toBeNull();
    expect(screen.getByText('95%')).not.toBeNull();
    // Real data-driven concepts, not placeholders.
    expect(screen.getByText('Algebra')).not.toBeNull();
    expect(screen.getByText('Calculus')).not.toBeNull();
  });

  it('renders an error state when the stats fetch fails', async () => {
    getStats.mockRejectedValue(new Error('network'));
    render(React.createElement(Dashboard));
    await waitFor(() => {
      expect(screen.getByText(/Could not load your learning stats/i)).not.toBeNull();
    });
  });

  it('renders a real SVG line chart when there are >= 2 progress points', async () => {
    getStats.mockResolvedValue({
      data: {
          quizzesTaken: 1,
          progressHistory: [
            { date: '2026-08-26', avgScore: 60 },
            { date: '2026-08-27', avgScore: 90 },
          ],
          difficultyPerformance: [],
          conceptPerformance: { strengths: [], weaknesses: [] },
        },
    });

    const container = render(React.createElement(Dashboard)).container;
    await waitFor(() => {
      expect(screen.getByText(/Progress Over Time/i)).not.toBeNull();
    });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(container.querySelector('polyline')).not.toBeNull();
  });
});
