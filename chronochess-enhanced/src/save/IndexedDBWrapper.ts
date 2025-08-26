import type { SaveDatabase } from './types';

/**
 * IndexedDB wrapper for ChronoChess save system
 * Provides a clean interface for storing large save data with versioning support
 */
export class IndexedDBWrapper {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly dbVersion: number;
  private readonly stores: (keyof SaveDatabase)[];

  constructor(dbName: string = 'ChronoChessSaves', dbVersion: number = 1) {
    this.dbName = dbName;
    this.dbVersion = dbVersion;
    this.stores = ['saves', 'metadata', 'backups', 'settings'];
  }

  /**
   * Initialize the IndexedDB connection
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('IndexedDB not supported'));
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;

        // Handle database errors after opening
        this.db.onerror = event => {
          console.error('Database error:', event);
        };

        resolve();
      };

      request.onupgradeneeded = event => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores if they don't exist
        this.stores.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });

            // Create indexes for efficient querying
            if (storeName === 'saves' || storeName === 'backups') {
              store.createIndex('timestamp', 'timestamp', { unique: false });
              store.createIndex('version', 'version', { unique: false });
            }

            if (storeName === 'metadata') {
              store.createIndex('timestamp', 'timestamp', { unique: false });
              store.createIndex('isAutoSave', 'isAutoSave', { unique: false });
              store.createIndex('isCorrupted', 'isCorrupted', { unique: false });
            }
          }
        });
      };
    });
  }

  /**
   * Save data to a specific store
   */
  async save<T extends keyof SaveDatabase>(
    storeName: T,
    id: string,
    data: SaveDatabase[T]
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const dataWithId = { ...data, id } as SaveDatabase[T] & { id: string };
      const request = store.put(dataWithId);

      request.onerror = () => {
        reject(new Error(`Failed to save to ${storeName}: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };

      transaction.onerror = () => {
        reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      };
    });
  }

  /**
   * Load data from a specific store
   */
  async load<T extends keyof SaveDatabase>(
    storeName: T,
    id: string
  ): Promise<SaveDatabase[T] | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onerror = () => {
        reject(new Error(`Failed to load from ${storeName}: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Remove the id field that was added for IndexedDB
          const { id: _, ...data } = result;
          resolve(data as SaveDatabase[T]);
        } else {
          resolve(null);
        }
      };
    });
  }

  /**
   * Delete data from a specific store
   */
  async delete<T extends keyof SaveDatabase>(storeName: T, id: string): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onerror = () => {
        reject(new Error(`Failed to delete from ${storeName}: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * List all entries in a store
   */
  async list<T extends keyof SaveDatabase>(
    storeName: T,
    options?: {
      index?: string;
      direction?: 'next' | 'prev';
      limit?: number;
    }
  ): Promise<Array<SaveDatabase[T] & { id: string }>> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);

      let source: IDBObjectStore | IDBIndex = store;
      if (options?.index) {
        source = store.index(options.index);
      }

      const request = source.openCursor(null, options?.direction);
      const results: Array<SaveDatabase[T] & { id: string }> = [];
      let count = 0;

      request.onerror = () => {
        reject(new Error(`Failed to list ${storeName}: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && (!options?.limit || count < options.limit)) {
          results.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  }

  /**
   * Count entries in a store
   */
  async count<T extends keyof SaveDatabase>(storeName: T): Promise<number> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();

      request.onerror = () => {
        reject(new Error(`Failed to count ${storeName}: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };
    });
  }

  /**
   * Clear all data from a store
   */
  async clear<T extends keyof SaveDatabase>(storeName: T): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => {
        reject(new Error(`Failed to clear ${storeName}: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve();
      };
    });
  }

  /**
   * Get storage usage information
   */
  async getStorageInfo(): Promise<{
    usage: number;
    quota: number;
    available: number;
    percentage: number;
  }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const available = quota - usage;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      return { usage, quota, available, percentage };
    }

    // Fallback for browsers without storage estimation
    return {
      usage: 0,
      quota: 0,
      available: 0,
      percentage: 0,
    };
  }

  /**
   * Check if storage is available and has enough space
   */
  async checkStorageAvailability(requiredBytes: number = 0): Promise<boolean> {
    try {
      const info = await this.getStorageInfo();
      return info.available >= requiredBytes;
    } catch {
      // If we can't check, assume it's available
      return true;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Delete the entire database
   */
  async deleteDatabase(): Promise<void> {
    this.close();

    return new Promise((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);

      deleteRequest.onerror = () => {
        reject(new Error(`Failed to delete database: ${deleteRequest.error?.message}`));
      };

      deleteRequest.onsuccess = () => {
        resolve();
      };

      deleteRequest.onblocked = () => {
        console.warn('Database deletion blocked - close all tabs using this database');
      };
    });
  }

  /**
   * Check if the database is initialized and ready
   */
  isReady(): boolean {
    return this.db !== null;
  }

  /**
   * Get database information
   */
  getDatabaseInfo(): {
    name: string;
    version: number;
    stores: string[];
    isReady: boolean;
  } {
    return {
      name: this.dbName,
      version: this.dbVersion,
      stores: [...this.stores],
      isReady: this.isReady(),
    };
  }
}

// Singleton instance for global use
export const saveDatabase = new IndexedDBWrapper();
