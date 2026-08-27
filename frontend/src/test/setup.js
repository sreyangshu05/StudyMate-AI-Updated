// Test environment setup for bun:test.
// bun's `--environment happy-dom` flag doesn't reliably expose `document` as a
// global in this runtime, so we boot happy-dom manually and wire its globals.
import { Window } from 'happy-dom';

const win = new Window();
globalThis.window = win;
globalThis.document = win.document;
globalThis.navigator = win.navigator;
globalThis.HTMLElement = win.HTMLElement;
globalThis.Element = win.Element;
globalThis.Node = win.Node;
globalThis.Event = win.Event;
globalThis.CustomEvent = win.CustomEvent;
globalThis.DocumentFragment = win.DocumentFragment;
globalThis.getComputedStyle = win.getComputedStyle.bind(win);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => 'blob:mock';
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};

class MockObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver = MockObserver;
globalThis.ResizeObserver = MockObserver;
