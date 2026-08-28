import { describe, it, expect, mock } from 'bun:test';
import { render, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import axe from 'axe-core';

// --- Shared stubs -----------------------------------------------------------
const documentsAPI = {
  getAll: mock(() => Promise.resolve({ data: { documents: [] } })),
  upload: mock(() => Promise.resolve({})),
  ingest: mock(() => Promise.resolve({})),
  retry: mock(() => Promise.resolve({})),
  delete: mock(() => Promise.resolve({})),
  getById: mock(() => Promise.resolve({})),
  getFileUrl: mock(() => Promise.resolve('blob:mock')),
};
const statsAPI = { getStats: mock(() => Promise.resolve({ data: {} })) };
const quizAPI = { generateQuiz: mock(() => Promise.resolve({ data: {} })), getQuizzes: mock(() => Promise.resolve({ data: { quizzes: [] } })) };
const chatAPI = {
  getChats: mock(() => Promise.resolve({ data: { chats: [] } })),
  getMessages: mock(() => Promise.resolve({ data: { messages: [] } })),
  createChat: mock(() => Promise.resolve({ data: { chatId: 1 } })),
  sendMessage: mock(() => Promise.resolve({ data: { message: '' } })),
};
const authAPI = { updateProfile: mock(() => Promise.resolve({ data: { user: { name: 'x' } } })) };

await mock.module('../services/api', () => ({
  documentsAPI, statsAPI, quizAPI, chatAPI, authAPI,
}));

const toast = mock(() => {}); toast.error = mock(() => {}); toast.success = mock(() => {});
await mock.module('react-hot-toast', () => ({ default: toast }));
await mock.module('react-pdf', () => ({
  Document: () => null, Page: () => null,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: '3.11.174' },
}));

// Stub AuthContext so Layout/Settings render without a provider.
const useAuth = mock(() => ({ user: { name: 'Test', email: 't@e.com' }, login: () => {}, logout: () => {} }));
await mock.module('../contexts/AuthContext', () => ({ useAuth, AuthProvider: ({ children }) => children }));
// Stub react-router-dom Link/navigate for Layout rendering.
await mock.module('react-router-dom', () => ({
  Link: ({ children, ...p }) => React.createElement('a', { href: p.to, 'aria-current': p['aria-current'] }, children),
  useNavigate: () => () => {},
  useLocation: () => ({ pathname: '/reader' }),
  NavLink: ({ children, ...p }) => React.createElement('a', { href: p.to }, children),
}));

const SourceSelector = (await import('./SourceSelector.jsx')).default;
const PDFViewer = (await import('./PDFViewer.jsx')).default;
const Dashboard = (await import('./Dashboard.jsx')).default;
const LoginForm = (await import('./LoginForm.jsx')).default;
const Layout = (await import('./Layout.jsx')).default;

// --- Helpers ----------------------------------------------------------------

/**
 * Run axe-core against a rendered container.
 * Explicitly includes the color-contrast rule (which is part of wcag2aa but
 * can be skipped by incomplete tag sets) plus keyboard/focus rules.
 */
async function axeClean(container, opts = {}) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] },
    rules: { 'color-contrast': { enabled: true } },
    ...opts,
  });
  if (results.violations.length) {
    const summary = results.violations
      .map((v) => `${v.id}: ${v.description} (${v.nodes.length} nodes)`)
      .join('\n');
    throw new Error(`axe violations:\n${summary}`);
  }
  expect(results.violations.length).toBe(0);
}

/**
 * Drive keyboard navigation through a container and assert every focusable
 * element is reachable via Tab without getting trapped.
 */
function keyboardTabOrder(container) {
  const focusable = container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const visited = [];
  let el = container;
  for (let i = 0; i < focusable.length + 2; i++) {
    // Simulate Tab: focus next element in DOM order.
    const next = focusable[visited.length];
    if (!next) break;
    next.focus();
    if (document.activeElement === next) visited.push(next);
    else break; // focus was swallowed — a trap
  }
  return { focusable: focusable.length, visited: visited.length };
}

// --- Tests ------------------------------------------------------------------

describe('accessibility: LoginForm', () => {
  it('has no axe violations (login mode)', async () => {
    const { container } = render(React.createElement(LoginForm));
    await waitFor(() => expect(container.textContent).toContain('Sign in to StudyMate'));
    await axeClean(container);
  });

  it('has no axe violations (register mode)', async () => {
    const { container } = render(React.createElement(LoginForm));
    const toggle = container.querySelector('button:not([type])') || [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Sign up'));
    fireEvent.click(toggle);
    await waitFor(() => expect(container.textContent).toContain('Create your StudyMate account'));
    await axeClean(container);
  });

  it('exposes an accessible name on the password visibility toggle', () => {
    const { container } = render(React.createElement(LoginForm));
    const toggle = [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label'));
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-label')).toMatch(/password/i);
  });

  it('all inputs and the submit button are reachable via keyboard Tab', () => {
    const { container } = render(React.createElement(LoginForm));
    const { focusable, visited } = keyboardTabOrder(container);
    expect(visited).toBe(focusable);
    expect(visited).toBeGreaterThanOrEqual(2);
  });
});

describe('accessibility: Layout', () => {
  it('has no axe violations with sidebar nav', async () => {
    const { container } = render(
      React.createElement(Layout, null, React.createElement('div', null, 'Page content'))
    );
    await waitFor(() => expect(container.textContent).toContain('StudyMate'));
    await axeClean(container);
  });

  it('provides a skip-to-content link', () => {
    const { container } = render(
      React.createElement(Layout, null, React.createElement('div', null, 'Page content'))
    );
    const skip = container.querySelector('a[href="#main-content"]');
    expect(skip).toBeTruthy();
    expect(skip.textContent).toMatch(/skip to content/i);
  });

  it('marks the active nav link with aria-current', () => {
    const { container } = render(
      React.createElement(Layout, null, React.createElement('div', null, 'Page content'))
    );
    const current = container.querySelector('[aria-current="page"]');
    expect(current).toBeTruthy();
    expect(current.textContent).toMatch(/reader/i);
  });

  it('main landmark has id=main-content (skip target)', () => {
    const { container } = render(
      React.createElement(Layout, null, React.createElement('div', null, 'Page content'))
    );
    expect(container.querySelector('main#main-content')).toBeTruthy();
  });

  it('nav links are reachable via keyboard Tab', () => {
    const { container } = render(
      React.createElement(Layout, null, React.createElement('div', null, 'Page content'))
    );
    const { focusable, visited } = keyboardTabOrder(container);
    expect(visited).toBe(focusable);
  });
});

describe('accessibility: SourceSelector', () => {
  it('has no axe violations in the empty state', async () => {
    documentsAPI.getAll.mockResolvedValue({ data: { documents: [] } });
    const { container } = render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [] }));
    await waitFor(() => expect(container.textContent).toContain('No documents uploaded'));
    await axeClean(container);
  });

  it('has no axe violations with a document list (icon-only buttons have aria-labels)', async () => {
    documentsAPI.getAll.mockResolvedValue({
      data: { documents: [
        { id: 1, title: 'Doc A', status: 'READY', chunk_count: 3, pages: 2 },
        { id: 2, title: 'Doc B', status: 'FAILED' },
      ] },
    });
    const { container } = render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [] }));
    await waitFor(() => expect(container.textContent).toContain('Doc A'));
    await axeClean(container);
  });

  it('icon-only retry and delete buttons have accessible names', async () => {
    documentsAPI.getAll.mockResolvedValue({
      data: { documents: [{ id: 1, title: 'Notes.pdf', status: 'FAILED' }] },
    });
    const { container } = render(React.createElement(SourceSelector, { onDocumentSelect: () => {}, selectedDocIds: [] }));
    await waitFor(() => expect(container.textContent).toContain('Notes.pdf'));
    const labeled = [...container.querySelectorAll('button[aria-label]')];
    expect(labeled.some((b) => /retry.*notes\.pdf/i.test(b.getAttribute('aria-label')))).toBe(true);
    expect(labeled.some((b) => /delete.*notes\.pdf/i.test(b.getAttribute('aria-label')))).toBe(true);
  });
});

describe('accessibility: PDFViewer', () => {
  it('has no axe violations in the no-pdf state', async () => {
    const { container } = render(React.createElement(PDFViewer, { docId: null }));
    await waitFor(() => expect(container.textContent).toContain('No PDF selected'));
    await axeClean(container);
  });
});

describe('accessibility: Dashboard', () => {
  it('has no axe violations with real stats data', async () => {
    statsAPI.getStats.mockResolvedValue({
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
    const { container } = render(React.createElement(Dashboard));
    await waitFor(() => expect(container.textContent).toContain('Dashboard'));
    await axeClean(container);
  });

  it('has no axe violations in the empty (new account) state', async () => {
    statsAPI.getStats.mockResolvedValue({
      data: {
        quizzesTaken: 0,
        avgScore: 0,
        totalAttempts: 0,
        bestScore: 0,
        studyStreak: 0,
        documentsCount: 0,
        progressHistory: [],
        difficultyPerformance: [],
        conceptPerformance: { strengths: [], weaknesses: [] },
      },
    });
    const { container } = render(React.createElement(Dashboard));
    await waitFor(() => expect(container.textContent).toContain('Dashboard'));
    await axeClean(container);
  });
});
