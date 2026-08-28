# Manual Screen-Reader Verification Checklist

> Automated axe-core tests cover WCAG 2.1 A/AA (component-level violations,
> color-contrast, heading order, landmark uniqueness, keyboard Tab reachability).
> The following must be confirmed manually with a real screen reader (NVDA on
> Windows, VoiceOver on macOS, or TalkBack on Android) against the production
> deployment. No tool can fully automate this.

## How to run

1. **NVDA (Windows, free):** Install from nvaccess.org. Press `Ctrl+Alt+N` to
   start. Use `Tab` / `Shift+Tab` to move, `H` to jump headings, `F` to jump
   form fields, `B` to jump buttons. Listen to what is announced.
2. **VoiceOver (macOS, built-in):** `Cmd+F5` to toggle. `Ctrl+Option+Arrow` to
   navigate, `Ctrl+Option+U` to open the rotor for landmarks/headings/links.
3. Test in **both Chrome and Firefox** (if supporting Firefox).

## Checklist

### Authentication (Login / Register)

- [ ] Page title / heading "Sign in to StudyMate" is announced on load.
- [ ] Each input announces its label: "Email address", "Password", "Full name"
      (register), "Confirm password" (register). Inputs use `sr-only` `<label>`
      with matching `htmlFor` — verify the association is read.
- [ ] Password show/hide button announces "Show password" / "Hide password"
      and its pressed state (`aria-pressed`).
- [ ] Tabbing order goes: name (register) → email → password → show/hide →
      confirm (register) → submit → toggle link. No traps.
- [ ] Form validation errors are announced (error text appears in the DOM;
      confirm NVDA reads it — consider `role="alert"` on the error container
      for live announcement; see Enhancement below).
- [ ] After login/register, focus moves to the main content of the dashboard
      (not stranded on the login form).

### App Shell (Layout / Navigation)

- [ ] "Skip to content" link is the **first** Tab stop on every page. Activating
      it moves focus into `#main-content` and skips the sidebar.
- [ ] Sidebar nav announces as a navigation landmark ("Main navigation"). The
      active page is announced with `aria-current="page"` (NVDA: "current page").
- [ ] Each nav link announces its name ("Home", "Reader", "Quiz", "Dashboard",
      "Chat", "Settings") and its icon is marked `aria-hidden` (not read aloud).
- [ ] Mobile: the hamburger button announces "Open navigation menu" /
      "Close navigation menu" with `aria-expanded` state.

### Reader (SourceSelector + PDFViewer)

- [ ] Empty state "No documents uploaded yet" is announced.
- [ ] Document list items announce the title, status ("Ready" / "Processing" /
      "Failed"), and chunk/page counts.
- [ ] The checkbox for each Ready document has an accessible label
      ("Select <title>") and announces checked/unchecked state.
- [ ] Retry button announces "Retry processing <title>"; delete announces
      "Delete <title>".
- [ ] PDF viewer: when no document is selected, "No PDF selected" is announced.
- [ ] PDF page navigation (prev/next) buttons announce their action and current
      page. PDF canvas content itself is not screen-reader accessible by
      nature — verify a text alternative or summary is available (see
      Enhancement below if not).

### Quiz

- [ ] Quiz generator form announces fields (question count, difficulty).
- [ ] Quiz questions announce the question text, answer options as a list,
      and the selected state.
- [ ] Submit and results are announced; the score is readable.

### Dashboard

- [ ] Headings are announced in order: h1 "Dashboard" → h2 section titles
      ("Progress Over Time", "Performance by Difficulty", "Topic Strengths",
      "Areas for Improvement", "Recent Attempts"). No skipped levels.
- [ ] Stat cards ("Quizzes Taken: 7") are read as label + value.
- [ ] SVG charts are **not** read by screen readers by default. Each chart
      must have a `title` or `aria-label` / `aria-describedby` with a text
      summary of the data. Verify and add if missing (see Enhancement below).

### Chat

- [ ] "New Chat" button is announced and creates a chat.
- [ ] Message input (textarea) announces its label / placeholder.
- [ ] Sent messages and received answers appear in the message list and are
      announced (consider `aria-live="polite"` on the message container so new
      answers are read automatically — see Enhancement below).

### Settings

- [ ] Profile name input is labeled and editable.
- [ ] Email field is read-only and announced as such (disabled input).
- [ ] Save button announces "Profile updated" success via toast (verify the
      toast is announced — react-hot-toast should use `aria-live`).

## Enhancements identified for future sprints

These are **not** current violations but would improve the screen-reader
experience beyond WCAG AA:

1. **`role="alert"` on form error containers** — so validation errors are
   live-announced the moment they appear, not just when focus reaches them.
2. **`aria-live="polite"` on the chat message list** — so AI answers are read
   aloud automatically when they arrive.
3. **Text alternatives for SVG charts** — Dashboard charts should have an
   `aria-label` or a visually-hidden data table as an alternative.
4. **PDF text extraction fallback** — expose extracted text chunks as an
   `aria-label` or collapsible text panel for the PDFViewer, so screen-reader
   users can read the document content (the canvas is not accessible).

## Result log

| Date | Tester | Screen reader | Browser | Pages checked | Issues found | Status |
|------|--------|---------------|---------|---------------|--------------|--------|
|      |        |               |         |               |              |        |

Fill in after each manual pass. File issues for any unchecked items.
