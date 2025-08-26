# Game State Management System

This module implements a comprehensive game state management system for ChronoChess using Zustand for state management, with full support for:

- Centralized game state management
- Move history tracking with undo/redo functionality
- Game state serialization/deserialization for save system
- FEN notation support for compatibility and debugging
- Auto-save functionality
- Integration with the chess engine

## Core Components

### GameStore (`gameStore.ts`)

The main Zustand store that manages all game state including:

- **Game State**: Current board position, turn, game status
- **Move History**: Complete history of moves with undo/redo stacks
- **Resources**: Player resources (Temporal Essence, Aether Shards, etc.)
- **Piece Evolutions**: Evolved piece configurations
- **UI State**: Interface state (selected squares, panel visibility)
- **Settings**: Game settings including auto-save configuration

### GameStateIntegration (`gameStateIntegration.ts`)

High-level integration layer that coordinates between the chess engine and store:

- **Move Making**: Validates moves through engine and updates store
- **Undo/Redo**: Manages move history with engine synchronization
- **Save/Load**: Handles game state persistence
- **Premium Currency**: Awards Aether Shards for elegant moves

## Usage Examples

### Basic Game Operations

```typescript
import { useGameStore, useGameIntegration } from './store';

// Using the store directly
const gameState = useGameStore(state => state.game);
const makeMove = useGameStore(state => state.makeMove);

// Using the integration layer (recommended)
const integration = useGameIntegration();

// Make a move
const success = await integration.makeMove('e2', 'e4');
if (success) {
  console.log('Move made successfully!');
}

// Undo/Redo
if (integration.getUndoRedoStatus().canUndo) {
  integration.undoMove();
}

// Save/Load game
integration.saveGame('my_game');
integration.loadGame('my_game');
```

### React Component Integration

```typescript
import React from 'react';
import { useGameStore, useMoveHistory, useUndoRedo } from './store';

function GameControls() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo();
  const moveHistory = useMoveHistory();
  const gameState = useGameStore(state => state.game);

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>
        Undo
      </button>
      <button onClick={redo} disabled={!canRedo}>
        Redo
      </button>

      <div>
        <h3>Move History ({moveHistory.length} moves)</h3>
        {moveHistory.map((move, index) => (
          <div key={index}>{move.san}</div>
        ))}
      </div>

      <div>
        Current Position: {gameState.fen}
      </div>
    </div>
  );
}
```

### Auto-Save Configuration

```typescript
import { useGameStore } from './store';

// Enable auto-save every 30 seconds
const store = useGameStore.getState();
store.enableAutoSave(30);

// Auto-save will trigger on:
// 1. Timer intervals (every 30 seconds)
// 2. Game state changes (debounced by 1 second)
// 3. Move making (with 100ms delay)

// Disable auto-save
store.disableAutoSave();
```

### FEN Operations

```typescript
import { useFenOperations } from './store';

const { loadFromFen, getCurrentFen } = useFenOperations();

// Load a specific position
loadFromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');

// Get current position
const currentFen = getCurrentFen();
console.log('Current position:', currentFen);
```

### Save System

```typescript
import { useSaveSystem } from './store';

const { serialize, deserialize, saveToStorage, loadFromStorage } = useSaveSystem();

// Manual serialization
const saveData = serialize();
console.log('Save data:', saveData);

// Save to localStorage
saveToStorage('my_save_slot');

// Load from localStorage
const loadSuccess = loadFromStorage('my_save_slot');
if (loadSuccess) {
  console.log('Game loaded successfully!');
}

// Custom save data handling
const customSaveData = {
  version: '1.0.0',
  timestamp: Date.now(),
  // ... other save data
};

const deserializeSuccess = deserialize(customSaveData);
```

## Data Structures

### SaveData Format

```typescript
interface SaveData {
  version: string; // Save format version
  timestamp: number; // Save timestamp
  game: GameState; // Current game state
  resources: ResourceState; // Player resources
  evolutions: Array<[string, PieceEvolution]>; // Piece evolutions
  settings: GameSettings; // Game settings
  moveHistory: Move[]; // Complete move history
  undoStack: GameState[]; // Undo stack
  redoStack: GameState[]; // Redo stack
}
```

### Move Structure

```typescript
interface Move {
  from: Square; // Source square (e.g., 'e2')
  to: Square; // Target square (e.g., 'e4')
  promotion?: PieceType; // Promotion piece if applicable
  san?: string; // Standard Algebraic Notation
  flags?: string; // Move flags
  eleganceScore?: number; // Elegance score for premium currency
  abilities?: PieceAbility[]; // Triggered piece abilities
}
```

## Features

### Undo/Redo System

- **Stack Management**: Maintains separate undo and redo stacks
- **Size Limiting**: Limits undo stack to 50 entries to prevent memory issues
- **Engine Synchronization**: Keeps chess engine in sync with store state
- **State Preservation**: Preserves complete game state for each undo point

### Auto-Save System

- **Multiple Triggers**: Timer-based, state-change-based, and move-based
- **Debouncing**: Prevents excessive saves with intelligent debouncing
- **Configurable Intervals**: Customizable auto-save frequency
- **Error Handling**: Graceful handling of storage errors

### Serialization System

- **Version Management**: Handles save format versioning
- **Data Validation**: Validates save data structure before loading
- **Error Recovery**: Graceful handling of corrupted save data
- **Compression Ready**: Structure designed for future compression support

### FEN Support

- **Standard Compliance**: Full FEN notation support
- **Debugging Aid**: Easy position sharing and debugging
- **Import/Export**: Position import/export functionality
- **Engine Integration**: Seamless integration with chess engine

## Performance Considerations

- **Selective Updates**: Uses Zustand's selective subscriptions to minimize re-renders
- **Memory Management**: Limits undo stack size and implements cleanup
- **Debounced Saves**: Prevents excessive localStorage operations
- **Efficient Serialization**: Optimized data structures for serialization

## Testing

The system includes comprehensive tests covering:

- **Unit Tests**: Individual store operations and state management
- **Integration Tests**: Chess engine and store coordination
- **Error Handling**: Graceful handling of edge cases and errors
- **Performance Tests**: Memory usage and operation efficiency

Run tests with:

```bash
npm test -- src/store --run
```

## Requirements Fulfilled

This implementation satisfies the following task requirements:

✅ **Implement Zustand store for centralized game state management**

- Complete Zustand store with all game state management
- Selective subscriptions for performance optimization
- Utility hooks for common operations

✅ **Create game state serialization/deserialization for save system**

- Full serialization/deserialization with version management
- localStorage integration with error handling
- Data validation and migration support

✅ **Build move history tracking with undo/redo functionality**

- Complete move history with undo/redo stacks
- Size-limited stacks to prevent memory issues
- Engine synchronization for consistent state

✅ **Add FEN notation support for compatibility and debugging**

- Full FEN import/export functionality
- Position loading with state management
- Debugging and analysis support

The system provides a robust foundation for the ChronoChess game state management, supporting all required functionality while maintaining performance and reliability.
