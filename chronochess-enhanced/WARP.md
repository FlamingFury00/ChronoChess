# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Development

```bash
# Start development server on http://localhost:5173
npm run dev

# Run tests
npm test                # Run tests once
npm run test:watch      # Watch mode
npm run test:ui         # Vitest UI

# Run a single test file
npx vitest src/engine/__tests__/ChessEngine.test.ts
npx vitest src/audio/__tests__/AudioManager.test.ts --run

# Code quality
npm run lint            # Check for linting errors
npm run lint:fix        # Auto-fix linting issues
npm run format          # Format code with Prettier
npm run format:check    # Check formatting without changes

# Build for production
npm run build

# Preview production build
npm run preview

# Docker development
docker-compose up chronochess-dev        # Development mode
docker-compose up chronochess-prod       # Production mode
```

## Architecture Overview

ChronoChess is an idle-autobattler chess hybrid built with React, TypeScript, and Vite. The architecture follows a modular pattern with clear separation of concerns.

### Core Systems Integration

The application uses **Zustand for centralized state management** (`src/store/gameStore.ts`), which orchestrates all game systems:

1. **Chess Engine** (`src/engine/ChessEngine.ts`): Extended chess.js with custom rules, piece abilities, and elegance scoring. Handles move validation, game state, and FEN notation.

2. **Evolution System** (`src/evolution/PieceEvolutionSystem.ts`): Complex piece upgrade system supporting 10^12 combinations. Each piece type has base attributes (moveRange, attackPower, defense, etc.) that can be upgraded using resources. Evolution data is stored per-piece with investment tracking.

3. **Resource Management** (`src/resources/ResourceManager.ts`): Idle progression with four resource types:
   - Temporal Essence (basic, auto-generates)
   - Mnemonic Dust (rare, from captures)
   - Aether Shards (premium currency)
   - Arcane Mana (special abilities)

4. **3D Rendering** (`src/rendering/ThreeJSRenderer.ts`): Three.js visualization with physics simulation via Cannon.js. Supports quality settings (low/medium/high/ultra) for performance optimization.

5. **Auto-Battle System** (`src/engine/AutoBattleSystem.ts`): AI-driven battles with evolved pieces, supporting both auto and manual game modes. Includes piece evolution configurations and ability triggers.

### State Flow

```
User Input → UI Components → Zustand Store → Game Systems → State Update → React Re-render
                                    ↓
                            Save System (auto/manual)
```

The game store (`GameStore`) maintains:

- Game state (chess position, turn, checks)
- Resource state (currencies, generation rates)
- Evolution data (per-piece upgrades, abilities)
- UI state (current scene, selected square)
- Settings (quality, sound, auto-save)

### Scene Management

The app uses a scene-based navigation system (`src/scenes/`):

- **MenuScene**: Main menu and navigation
- **SoloModeScene**: Single-player encounters
- **EvolutionScene**: Piece upgrade interface
- **SettingsScene**: Game configuration

Each scene receives an `onSceneChange` callback for navigation.

### Save System Architecture

The save system (`src/save/SaveSystem.ts`) provides:

- Serialization/deserialization of complete game state
- IndexedDB storage for persistence
- Auto-save functionality (configurable interval)
- Move history with undo/redo support (max 50 states)
- Data compression for efficient storage

### Mobile Support

Mobile-specific features (`src/components/MobileControls/`):

- Touch gesture handling for chess moves
- Orientation detection and adaptation
- Performance mode toggle for lower-end devices
- Responsive UI scaling

### Audio System

Modular audio architecture (`src/audio/`):

- Procedural sound generation
- Spatial audio for 3D positioning
- Ambient soundscapes
- Audio feedback for game events

## Key Technical Decisions

1. **Chess.js Extension**: Rather than building from scratch, the engine extends chess.js with custom mechanics while maintaining standard chess compatibility.

2. **Zustand Over Redux**: Chosen for simpler API and better TypeScript support, with subscribeWithSelector middleware for fine-grained updates.

3. **Vite + React 18**: Modern build tooling with fast HMR and optimal bundle sizes.

4. **Component Composition**: UI components follow compound component pattern with clear prop interfaces.

5. **Type Safety**: Comprehensive TypeScript types for all game entities, ensuring compile-time safety for complex evolution combinations.

## Testing Strategy

Tests use Vitest with React Testing Library:

- Unit tests for game logic (engine, evolution, resources)
- Component tests for UI interactions
- Integration tests for state management
- Setup file at `src/test/setup.ts`

## Code Quality

Pre-commit hooks via Husky + lint-staged ensure:

- ESLint validation (TypeScript-aware)
- Prettier formatting
- No build-breaking changes

Configuration:

- ESLint: `eslint.config.js` (flat config)
- TypeScript: `tsconfig.json` with app/node references
- Prettier: Standard configuration in `package.json`
