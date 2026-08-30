# Manual Screen Reader Verification Checklist

This checklist is for the current StudyMate UI and should be used after any change to navigation, forms, charts, chat, or document viewing.

## What is already covered

- Automated axe-based checks cover common WCAG issues in the component tree.
- Local frontend tests now run under Vitest/jsdom instead of Bun-specific test APIs.
- The app shell, auth flow, dashboard, quiz flow, chat flow, settings flow, and reader empty states are all implemented in the current codebase.

## What still needs manual verification

Some behaviors cannot be fully proven by automated checks alone:

- Real screen reader announcements
- Focus order after login and page transitions
- Landmark and heading navigation
- Chart and PDF accessibility summaries
- Toast and validation message announcements

## How to test

Use one real screen reader on a real browser:

- Windows: NVDA on Chrome or Firefox
- macOS: VoiceOver on Safari or Chrome
- Android: TalkBack if mobile accessibility is being checked

## Checklist

### Authentication

- [ ] The login and registration page announces the page title and main heading.
- [ ] Each input has an accessible label.
- [ ] Show and hide password controls announce their state.
- [ ] Validation errors are announced when the form is submitted incorrectly.
- [ ] After successful login or registration, focus lands on the authenticated app shell.

### App Shell and Navigation

- [ ] Skip navigation is the first meaningful keyboard target.
- [ ] The sidebar is announced as navigation.
- [ ] The active page is announced with `aria-current="page"`.
- [ ] Mobile navigation controls announce open and closed state.

### Reader

- [ ] Empty document state is announced clearly.
- [ ] Document rows announce title, status, and progress information.
- [ ] Ready documents expose an accessible selection control.
- [ ] Retry and delete actions have descriptive labels.
- [ ] PDF viewer controls announce previous, next, zoom, and rotate actions.
- [ ] The PDF experience provides a usable text alternative or summary for screen readers.

### Quiz

- [ ] Quiz creation fields are announced correctly.
- [ ] Questions, answer choices, and selected states are announced.
- [ ] Score and completion state are announced after submission.

### Dashboard

- [ ] Headings are announced in a logical order.
- [ ] Stat cards are read as label plus value.
- [ ] Charts expose a text summary or equivalent accessible description.

### Chat

- [ ] New chat creation is announced.
- [ ] The message input is labeled.
- [ ] Assistant replies are announced when they appear.
- [ ] Citations are readable and navigable.

### Settings

- [ ] Profile name editing is announced correctly.
- [ ] Email is clearly read-only.
- [ ] Success and error toasts are announced.

## Result log

| Date | Tester | Screen reader | Browser | Pages checked | Issues found | Status |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## Notes

- Keep this checklist aligned with the current UI.
- If a feature changes, update the checklist in the same change.
- Do not mark an item as verified unless it was tested manually in a real browser with a real screen reader.
