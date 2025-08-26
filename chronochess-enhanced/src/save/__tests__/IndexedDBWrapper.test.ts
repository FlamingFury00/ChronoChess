import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexedDBWrapper } from '../IndexedDBWrapper';
import type { SaveDatabase } from '../types';

// Mock IndexedDB (use `any` so tests can manipulate request handlers freely)
const mockIndexedDB: any = {
  open: vi.fn(),
  deleteDatabase: vi.fn(),
};

const mockIDBDatabase: any = {
  createObjectStore: vi.fn(),
  transaction: vi.fn(),
  close: vi.fn(),
  onerror: null,
  objectStoreNames: {
    contains: vi.fn(() => false),
  },
};

const mockIDBObjectStore: any = {
  createIndex: vi.fn(),
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  clear: vi.fn(),
  count: vi.fn(),
  openCursor: vi.fn(),
  index: vi.fn(),
};

const mockIDBTransaction: any = {
  objectStore: vi.fn(() => mockIDBObjectStore),
  onerror: null,
};

const mockIDBRequest: any = {
  result: null,
  error: null,
  onsuccess: null,
  onerror: null,
  onupgradeneeded: null,
};

// Setup global mocks
Object.defineProperty(window, 'indexedDB', {
  value: mockIndexedDB,
  writable: true,
});
try {
  // Also expose on globalThis and Node global so unqualified `indexedDB` calls
  // in the implementation resolve to the mock during tests.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  globalThis.indexedDB = mockIndexedDB;
  try {
    (global as any).indexedDB = mockIndexedDB;
  } catch {}
} catch {}

// Mock navigator.storage
Object.defineProperty(navigator, 'storage', {
  value: {
    estimate: vi.fn().mockResolvedValue({
      usage: 1024 * 1024, // 1MB
      quota: 100 * 1024 * 1024, // 100MB
    }),
  },
  writable: true,
});

describe('IndexedDBWrapper', () => {
  let wrapper: IndexedDBWrapper;

  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure each test starts with the mock IndexedDB installed. Some tests
    // intentionally unset `window.indexedDB` and must not leak that state to
    // other tests. Assign directly when possible (safer if property is
    // non-configurable but writable); fall back to defineProperty otherwise.
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.indexedDB = mockIndexedDB;
      // Mirror to globalThis/global for unqualified references
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      globalThis.indexedDB = mockIndexedDB;
      try {
        (global as any).indexedDB = mockIndexedDB;
      } catch {}
    } catch {
      try {
        Object.defineProperty(window, 'indexedDB', {
          value: mockIndexedDB,
          writable: true,
          configurable: true,
        });
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        globalThis.indexedDB = mockIndexedDB;
        try {
          (global as any).indexedDB = mockIndexedDB;
        } catch {}
      } catch {}
    }

    wrapper = new IndexedDBWrapper('TestDB', 1);

    // Setup default mock behaviors
    mockIndexedDB.open.mockImplementation(() => {
      const request = { ...mockIDBRequest };
      setTimeout(() => {
        request.result = mockIDBDatabase;
        if (request.onsuccess) request.onsuccess({ target: request });
      }, 0);
      return request;
    });

    mockIDBDatabase.transaction.mockReturnValue(mockIDBTransaction);
    // Ensure createObjectStore returns our object store mock so calls to
    // `store.createIndex` succeed during onupgradeneeded.
    mockIDBDatabase.createObjectStore.mockImplementation(() => mockIDBObjectStore);

    // Restore navigator.storage mock in case a test mutated it
    try {
      Object.defineProperty(navigator, 'storage', {
        value: {
          estimate: vi.fn().mockResolvedValue({ usage: 1024 * 1024, quota: 100 * 1024 * 1024 }),
        },
        writable: true,
      });
    } catch {}
  });

  afterEach(() => {
    wrapper.close();
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await expect(wrapper.initialize()).resolves.not.toThrow();
      expect(wrapper.isReady()).toBe(true);
    });

    it('should throw error if IndexedDB is not supported', async () => {
      Object.defineProperty(window, 'indexedDB', {
        value: undefined,
        writable: true,
      });

      const wrapperNoIDB = new IndexedDBWrapper();
      await expect(wrapperNoIDB.initialize()).rejects.toThrow('IndexedDB not supported');
    });

    it('should handle database open error', async () => {
      mockIndexedDB.open.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Open failed');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.initialize()).rejects.toThrow('Failed to open database');
    });

    it('should create object stores on upgrade', async () => {
      mockIndexedDB.open.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = mockIDBDatabase;
          if (request.onupgradeneeded) {
            request.onupgradeneeded({ target: request });
          }
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await wrapper.initialize();

      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith('saves', { keyPath: 'id' });
      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith('metadata', { keyPath: 'id' });
      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith('backups', { keyPath: 'id' });
      expect(mockIDBDatabase.createObjectStore).toHaveBeenCalledWith('settings', { keyPath: 'id' });
    });
  });

  describe('Save Operations', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should save data successfully', async () => {
      const testData = { version: '1.0.0', timestamp: Date.now() };

      mockIDBObjectStore.put.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.save('saves', 'test-id', testData as any)).resolves.not.toThrow();
      expect(mockIDBObjectStore.put).toHaveBeenCalledWith({ ...testData, id: 'test-id' });
    });

    it('should handle save errors', async () => {
      const testData = { version: '1.0.0', timestamp: Date.now() };

      mockIDBObjectStore.put.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Put failed');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.save('saves', 'test-id', testData as any)).rejects.toThrow(
        'Failed to save to saves'
      );
    });

    it('should throw error if not initialized', async () => {
      const uninitializedWrapper = new IndexedDBWrapper();
      const testData = { version: '1.0.0', timestamp: Date.now() };

      await expect(uninitializedWrapper.save('saves', 'test-id', testData as any)).rejects.toThrow(
        'Database not initialized'
      );
    });
  });

  describe('Load Operations', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should load data successfully', async () => {
      const testData = { id: 'test-id', version: '1.0.0', timestamp: Date.now() };

      mockIDBObjectStore.get.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = testData;
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      const result = await wrapper.load('saves', 'test-id');

      expect(result).toEqual({ version: '1.0.0', timestamp: testData.timestamp });
      expect(mockIDBObjectStore.get).toHaveBeenCalledWith('test-id');
    });

    it('should return null for non-existent data', async () => {
      mockIDBObjectStore.get.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = null;
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      const result = await wrapper.load('saves', 'non-existent');
      expect(result).toBeNull();
    });

    it('should handle load errors', async () => {
      mockIDBObjectStore.get.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Get failed');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.load('saves', 'test-id')).rejects.toThrow('Failed to load from saves');
    });
  });

  describe('Delete Operations', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should delete data successfully', async () => {
      mockIDBObjectStore.delete.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.delete('saves', 'test-id')).resolves.not.toThrow();
      expect(mockIDBObjectStore.delete).toHaveBeenCalledWith('test-id');
    });

    it('should handle delete errors', async () => {
      mockIDBObjectStore.delete.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Delete failed');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.delete('saves', 'test-id')).rejects.toThrow(
        'Failed to delete from saves'
      );
    });
  });

  describe('List Operations', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should list data successfully', async () => {
      const testData = [
        { id: 'item1', value: 'test1' },
        { id: 'item2', value: 'test2' },
      ];

      mockIDBObjectStore.openCursor.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        let index = 0;

        const mockCursor: any = {
          value: null as any,
          continue: vi.fn(() => {
            setTimeout(() => {
              index++;
              if (index < testData.length) {
                mockCursor.value = testData[index];
                // Ensure the request.result points at an object with `result`
                // referencing the cursor so the implementation reads it.
                request.result = mockCursor;
                if (request.onsuccess) request.onsuccess({ target: request });
              } else {
                request.result = null;
                if (request.onsuccess) request.onsuccess({ target: request });
              }
            }, 0);
          }),
        };

        setTimeout(() => {
          if (testData.length > 0) {
            mockCursor.value = testData[0];
            request.result = mockCursor;
            if (request.onsuccess) request.onsuccess({ target: request });
          } else {
            request.result = null;
            if (request.onsuccess) request.onsuccess({ target: request });
          }
        }, 0);

        return request;
      });

      const result = await wrapper.list('saves');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(testData[0]);
      expect(result[1]).toEqual(testData[1]);
    });

    it('should handle list with limit', async () => {
      const testData = [
        { id: 'item1', value: 'test1' },
        { id: 'item2', value: 'test2' },
        { id: 'item3', value: 'test3' },
      ];

      mockIDBObjectStore.openCursor.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        let index = 0;

        const mockCursor: any = {
          value: null as any,
          continue: vi.fn(() => {
            setTimeout(() => {
              index++;
              if (index < testData.length) {
                mockCursor.value = testData[index];
                request.result = mockCursor;
                if (request.onsuccess) request.onsuccess({ target: request });
              } else {
                request.result = null;
                if (request.onsuccess) request.onsuccess({ target: request });
              }
            }, 0);
          }),
        };

        setTimeout(() => {
          if (testData.length > 0) {
            mockCursor.value = testData[0];
            request.result = mockCursor;
            if (request.onsuccess) request.onsuccess({ target: request });
          } else {
            request.result = null;
            if (request.onsuccess) request.onsuccess({ target: request });
          }
        }, 0);

        return request;
      });

      const result = await wrapper.list('saves', { limit: 2 });

      expect(result).toHaveLength(2);
    });

    it('should use index when specified', async () => {
      const mockIndex = { openCursor: vi.fn() };
      mockIDBObjectStore.index.mockReturnValue(mockIndex);

      mockIndex.openCursor.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: { result: null } });
        }, 0);
        return request;
      });

      await wrapper.list('saves', { index: 'timestamp' });

      expect(mockIDBObjectStore.index).toHaveBeenCalledWith('timestamp');
      expect(mockIndex.openCursor).toHaveBeenCalled();
    });
  });

  describe('Count Operations', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should count entries successfully', async () => {
      mockIDBObjectStore.count.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.result = 5;
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      const count = await wrapper.count('saves');
      expect(count).toBe(5);
    });

    it('should handle count errors', async () => {
      mockIDBObjectStore.count.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Count failed');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.count('saves')).rejects.toThrow('Failed to count saves');
    });
  });

  describe('Clear Operations', () => {
    beforeEach(async () => {
      await wrapper.initialize();
    });

    it('should clear store successfully', async () => {
      mockIDBObjectStore.clear.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.clear('saves')).resolves.not.toThrow();
      expect(mockIDBObjectStore.clear).toHaveBeenCalled();
    });

    it('should handle clear errors', async () => {
      mockIDBObjectStore.clear.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Clear failed');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.clear('saves')).rejects.toThrow('Failed to clear saves');
    });
  });

  describe('Storage Information', () => {
    it('should get storage info when supported', async () => {
      const info = await wrapper.getStorageInfo();

      expect(info.usage).toBe(1024 * 1024);
      expect(info.quota).toBe(100 * 1024 * 1024);
      expect(info.available).toBe(99 * 1024 * 1024);
      expect(info.percentage).toBeCloseTo(1, 1);
    });

    it('should return default values when storage estimation not supported', async () => {
      Object.defineProperty(navigator, 'storage', {
        value: undefined,
        writable: true,
      });

      const wrapperNoStorage = new IndexedDBWrapper();
      const info = await wrapperNoStorage.getStorageInfo();

      expect(info.usage).toBe(0);
      expect(info.quota).toBe(0);
      expect(info.available).toBe(0);
      expect(info.percentage).toBe(0);
    });

    it('should check storage availability', async () => {
      const hasSpace = await wrapper.checkStorageAvailability(1024);
      expect(hasSpace).toBe(true);

      const hasSpaceForLarge = await wrapper.checkStorageAvailability(200 * 1024 * 1024);
      expect(hasSpaceForLarge).toBe(false);
    });
  });

  describe('Database Management', () => {
    it('should close database connection', () => {
      wrapper.close();
      expect(wrapper.isReady()).toBe(false);
    });

    it('should delete database', async () => {
      mockIndexedDB.deleteDatabase.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.deleteDatabase()).resolves.not.toThrow();
      expect(mockIndexedDB.deleteDatabase).toHaveBeenCalled();
    });

    it('should handle database deletion error', async () => {
      mockIndexedDB.deleteDatabase.mockImplementation(() => {
        const request = { ...mockIDBRequest };
        setTimeout(() => {
          request.error = new Error('Delete database failed');
          if (request.onerror) request.onerror({ target: request });
        }, 0);
        return request;
      });

      await expect(wrapper.deleteDatabase()).rejects.toThrow('Failed to delete database');
    });

    it('should get database info', () => {
      const info = wrapper.getDatabaseInfo();

      expect(info.name).toBe('TestDB');
      expect(info.version).toBe(1);
      expect(info.stores).toEqual(['saves', 'metadata', 'backups', 'settings']);
      expect(info.isReady).toBe(false); // Not initialized in this test
    });
  });
});
