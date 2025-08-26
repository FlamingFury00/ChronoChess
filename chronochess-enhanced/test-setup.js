// Simple test to verify project setup
import { ChessEngine } from './src/engine/ChessEngine.js';
import { ResourceManager } from './src/resources/ResourceManager.js';
import { PieceEvolutionSystem } from './src/evolution/PieceEvolutionSystem.js';

console.log('Testing project setup...');

try {
  // Test chess engine
  const engine = new ChessEngine();
  console.log('✓ Chess engine initialized');

  // Test resource manager
  const resourceManager = new ResourceManager();
  console.log('✓ Resource manager initialized');

  // Test evolution system
  const evolutionSystem = new PieceEvolutionSystem();
  console.log('✓ Evolution system initialized');

  console.log('✓ All core systems initialized successfully!');
  console.log('Project setup is complete and working correctly.');
} catch (error) {
  console.error('✗ Error during setup test:', error);
  process.exit(1);
}
