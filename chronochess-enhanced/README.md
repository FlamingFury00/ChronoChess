# ChronoChess Enhanced

An idle-autobattler chess hybrid that combines traditional chess mechanics with idle progression systems, narrative encounters, and advanced 3D visualization.

## Features

- **Enhanced Chess Engine**: Traditional chess with custom rules and piece abilities
- **Idle Progression**: Resources generate automatically over time
- **Piece Evolution**: Complex upgrade system with 10^12 possible combinations
- **3D Visualization**: Immersive Three.js rendering with physics simulation
- **Narrative Encounters**: Story-driven single-player campaign
- **Multiplayer**: Competitive battles with evolved pieces
- **Premium Aesthetics**: Monetization through visual enhancements

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite
- **3D Graphics**: Three.js + Cannon.js (physics)
- **Chess Logic**: chess.js with custom extensions
- **State Management**: Zustand
- **Styling**: CSS3 with modern design principles
- **Code Quality**: ESLint + Prettier + Husky

## Getting Started

### Prerequisites

- Node.js 20+
- npm or yarn
- Git

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd chronochess-enhanced
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### Development Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run preview` - Preview production build

### Docker Development

For containerized development:

```bash
# Development
docker-compose up chronochess-dev

# Production
docker-compose up chronochess-prod
```

## Project Structure

```
src/
├── engine/          # Chess engine and game logic
├── evolution/       # Piece evolution system
├── resources/       # Resource management and idle systems
├── rendering/       # 3D graphics and visualization
├── physics/         # Physics simulation
├── store/           # State management
├── components/      # React components (future)
├── hooks/           # Custom React hooks (future)
└── utils/           # Utility functions (future)
```

## Architecture

The application follows a modular architecture with clear separation of concerns:

- **Engine Layer**: Core chess logic with custom extensions
- **Evolution Layer**: Complex piece upgrade and combination system
- **Resource Layer**: Idle progression and premium currency
- **Rendering Layer**: 3D visualization with Three.js
- **Physics Layer**: Realistic piece interactions with Cannon.js
- **State Layer**: Centralized state management with Zustand

## Requirements Coverage

This implementation addresses the following key requirements:

- **12.1**: Performance optimization with quality settings
- **12.2**: Responsive design for all device types
- **12.3**: Scalable architecture supporting future features

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Code Quality

This project uses automated code quality tools:

- **ESLint**: Linting and code standards
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit checks
- **lint-staged**: Run linters on staged files

All commits must pass linting and formatting checks.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Roadmap

- [x] Project setup and core infrastructure
- [ ] Enhanced chess engine implementation
- [ ] Resource management and idle systems
- [ ] Piece evolution system
- [ ] 3D rendering foundation
- [ ] Physics integration
- [ ] User interface development
- [ ] Audio system implementation
- [ ] Save system and data persistence
- [ ] Single player story mode
- [ ] Multiplayer infrastructure
- [ ] Aesthetic booster system
- [ ] Performance optimization
- [ ] Testing and quality assurance
- [ ] Deployment and launch preparation
