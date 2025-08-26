# ChronoChess Save System

A comprehensive save system for ChronoChess that provides reliable data persistence, auto-saving, backup/recovery, and data portability features.

## Features

### ✅ Implemented (Task 9.1)

- **IndexedDB Storage**: Large save data storage using IndexedDB with automatic fallback
- **Auto-Save System**: Configurable auto-save with customizable intervals
- **Save Data Versioning**: Migration system for backward compatibility
- **Backup & Recovery**: Automatic backup creation and corruption recovery
- **Data Validation**: Checksum validation and data integrity checks
- **Storage Management**: Storage usage monitoring and cleanup utilities
- **Export/Import**: Save data portability for backup and transfer
- **Error Handling**: Comprehensive error handling with graceful degradation

### 🚧 Planned (Task 9.2)

- Evolution combination tracking with efficient storage
- Player statistics system with achievement tracking
- Progress export/import functionality for data portability
- Save data compression for storage optimization
- Comprehensive test coverage for save system reliability

## Architecture

```
SaveSystem
├── IndexedDBWrapper (Low-level database operations)
├── SaveData Management (Serialization/Deserialization)
├── Auto-Save Controller (Automatic saving)
├── Backup Manager (Backup creation and recovery)
├── Migration System (Version compatibility)
└── Storage Monitor (Usage tracking and cleanup)
```

## Usage

### Basic Save/Load Operations

```typescript
import { saveSystem } from './SaveSystem';

// Initialize the save system
await saveSystem.initialize();

// Save game data
await saveSystem.saveGame('my-save-slot', gameState, resources, evolutions, settings, {
  name: 'My Game Save',
});

// Load game data
const loadedData = await saveSystem.loadGame('my-save-slot');
if (loadedData) {
  const { gameState, resources, evolutions, settings } = loadedData;
  // Restore game state
}

// List all saves
const saveSlots = await saveSystem.listSaveSlots();
```

### Auto-Save Integration

```typescript
// Start auto-save (saves every 60 seconds by default)
saveSystem.startAutoSave();

// Listen for auto-save events
window.addEventListener('chronochess:autosave-requested', async () => {
  // Get current game state and save it
  await saveSystem.saveGame('auto-save', currentGameState, ...);
});

// Stop auto-save
saveSystem.stopAutoSave();
```

### Export/Import

```typescript
// Export save data
const exportData = await saveSystem.exportSave('my-save-slot');
// Save exportData to file or send to server

// Import save data
await saveSystem.importSave('imported-slot', exportData);
```

### Storage Management

```typescript
// Get storage information
const storageInfo = await saveSystem.getStorageInfo();
console.log(`Using ${storageInfo.usage} bytes of ${storageInfo.quota} bytes`);

// Cleanup old saves and backups
await saveSystem.cleanup();
```

## Configuration

```typescript
const saveSystem = new SaveSystem({
  maxSaveSlots: 10, // Maximum number of save slots
  maxBackups: 5, // Maximum backups per save slot
  autoSaveInterval: 60, // Auto-save interval in seconds
  compressionEnabled: true, // Enable save data compression
  checksumValidation: true, // Enable data integrity checks
  backupOnSave: true, // Create backup before overwriting
});
```

## Data Structures

### SaveData

```typescript
interface SaveData {
  version: string;
  timestamp: number;
  checksum?: string;
  compressed?: boolean;

  // Core game data
  game: GameState;
  resources: ResourceState;
  evolutions: Array<[string, IPieceEvolution]>;
  settings: GameSettings;

  // Extended data
  moveHistory: Move[];
  undoStack: GameState[];
  redoStack: GameState[];
  playerStats?: PlayerStatistics;
  achievements?: Achievement[];
  unlockedContent?: UnlockedContent;
}
```

### SaveSlot Metadata

```typescript
interface SaveSlot {
  id: string;
  name: string;
  timestamp: number;
  version: string;
  playerLevel?: number;
  totalPlayTime?: number;
  isAutoSave: boolean;
  isCorrupted: boolean;
  size: number;
}
```

## Error Handling

The save system includes comprehensive error handling:

```typescript
try {
  await saveSystem.saveGame(/* ... */);
} catch (error) {
  if (error instanceof SaveError) {
    switch (error.type) {
      case SaveErrorType.STORAGE_FULL:
        // Handle storage full
        break;
      case SaveErrorType.CORRUPTED_DATA:
        // Attempt recovery from backup
        break;
      case SaveErrorType.VERSION_MISMATCH:
        // Handle version migration
        break;
    }
  }
}
```

## Browser Compatibility

- **Chrome/Edge**: Full support with IndexedDB
- **Firefox**: Full support with IndexedDB
- **Safari**: Full support with IndexedDB
- **Mobile browsers**: Optimized for mobile storage constraints

## Storage Limits

- **IndexedDB**: Typically 50% of available disk space
- **Automatic cleanup**: Removes corrupted saves and old backups
- **Storage monitoring**: Tracks usage and warns when approaching limits

## Security Considerations

- **Data validation**: All loaded data is validated before use
- **Checksum verification**: Detects data corruption and tampering
- **Backup recovery**: Automatic recovery from corrupted saves
- **Version migration**: Safe migration between save format versions

## Performance

- **Lazy loading**: Only loads save data when needed
- **Efficient serialization**: Optimized for large evolution datasets
- **Background operations**: Auto-save and cleanup run in background
- **Memory management**: Proper cleanup to prevent memory leaks

## Testing

The save system includes comprehensive tests:

- **Unit tests**: Individual component testing
- **Integration tests**: Full save/load cycle testing
- **Error scenario tests**: Corruption and recovery testing
- **Performance tests**: Large dataset handling

Run tests with:

```bash
npm test src/save
```

## Migration Guide

When upgrading save format versions:

1. **Automatic migration**: The system automatically migrates old saves
2. **Backup creation**: Original saves are backed up before migration
3. **Rollback support**: Failed migrations can be rolled back
4. **Version tracking**: All saves track their format version

## Troubleshooting

### Common Issues

1. **"IndexedDB not supported"**: Browser doesn't support IndexedDB
   - **Solution**: Use a modern browser or enable IndexedDB

2. **"Storage full"**: Not enough storage space
   - **Solution**: Run cleanup or free up disk space

3. **"Corrupted data"**: Save file is corrupted
   - **Solution**: System automatically attempts backup recovery

4. **"Version mismatch"**: Save from different game version
   - **Solution**: System automatically migrates to current version

### Debug Mode

Enable debug logging:

```typescript
// Enable detailed logging
console.log('Save system info:', saveSystem.getDatabaseInfo());
```

## Future Enhancements (Task 9.2)

- **Cloud sync**: Synchronize saves across devices
- **Compression**: Reduce storage usage with compression
- **Analytics**: Track player progress and statistics
- **Achievement system**: Unlock achievements based on progress
- **Social features**: Share saves and compete with friends
