import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock WebGL context for Three.js tests
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: vi.fn().mockImplementation((contextType: string) => {
    if (contextType === 'webgl' || contextType === 'webgl2') {
      return {
        getExtension: vi.fn(),
        getParameter: vi.fn(),
        createShader: vi.fn(),
        shaderSource: vi.fn(),
        compileShader: vi.fn(),
        createProgram: vi.fn(),
        attachShader: vi.fn(),
        linkProgram: vi.fn(),
        useProgram: vi.fn(),
        getAttribLocation: vi.fn(),
        getUniformLocation: vi.fn(),
        enableVertexAttribArray: vi.fn(),
        vertexAttribPointer: vi.fn(),
        uniform1f: vi.fn(),
        uniform2f: vi.fn(),
        uniform3f: vi.fn(),
        uniform4f: vi.fn(),
        uniformMatrix4fv: vi.fn(),
        createBuffer: vi.fn(),
        bindBuffer: vi.fn(),
        bufferData: vi.fn(),
        createTexture: vi.fn(),
        bindTexture: vi.fn(),
        texImage2D: vi.fn(),
        texParameteri: vi.fn(),
        generateMipmap: vi.fn(),
        drawArrays: vi.fn(),
        drawElements: vi.fn(),
        clear: vi.fn(),
        clearColor: vi.fn(),
        clearDepth: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
        depthFunc: vi.fn(),
        blendFunc: vi.fn(),
        viewport: vi.fn(),
      };
    }
    return null;
  }),
});

// Ensure a navigator object with a `storage.estimate` exists for tests that
// call storage APIs. Install on globalThis so both `navigator` and
// `window.navigator` lookups succeed.
const _global: any = globalThis as any;
// Ensure navigator.storage.estimate exists. If navigator or storage is missing,
// create them. The previous logic inverted the condition and could leave
// navigator.storage undefined.
const _nav = _global.navigator || {};
if (!(_nav && _nav.storage && typeof _nav.storage.estimate === 'function')) {
  _nav.storage = {
    estimate: vi.fn(async () => ({ usage: 1024 * 1024, quota: 50 * 1024 * 1024 })),
  };
  _global.navigator = _nav;
}
// Do not mock IndexedDB globally here — tests expect to control its presence/absence themselves.

// Provide a minimal `localStorage` implementation for tests that access it
// (only install when not already present). Tests can still spy/override methods.
// Provide a minimal `localStorage` implementation for tests that access it
// (only install when not already present). Tests can still spy/override methods.
// Provide a minimal `localStorage` implementation for tests that access it
// (only install when not already present). Also install on `window` and
// `global` so code referencing any of those finds the mock.
if (typeof (globalThis as any).localStorage === 'undefined') {
  const _store = new Map<string, string>();
  const storageMock = {
    getItem: (k: string) => (_store.has(k) ? (_store.get(k) as string) : null),
    setItem: (k: string, v: string) => _store.set(k, String(v)),
    removeItem: (k: string) => _store.delete(k),
    clear: () => _store.clear(),
  } as unknown as Storage;

  // Ensure `window` exists in the test environment and point it at globalThis
  if (typeof (globalThis as any).window === 'undefined') {
    (globalThis as any).window = globalThis as any;
  }

  // Define localStorage as a real global property so bare references like
  // `localStorage.setItem(...)` don't throw in different test contexts.
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: storageMock,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {}

  try {
    // Also define on Node global if available
    // (some test environments reference `global.localStorage`)
    (global as any).localStorage = storageMock;
  } catch {}

  try {
    (globalThis as any).window.localStorage = storageMock;
  } catch {}
}

// Install a very small, non-invasive IndexedDB stub when not present. This
// prevents wide failures in tests that expect IndexedDB to exist; the stub is
// intentionally minimal so tests that need specific behavior should replace it
// with a more complete mock in their own setup.
// Do not mock IndexedDB globally here — tests expect to control its presence/absence themselves.
