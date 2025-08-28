// AI Worker for ChronoChess - ES module version
import { Chess } from 'chess.js';

// Worker expects a module URL to import the AIOpponent implementation.
// This avoids eval'ing TypeScript/JS source and lets the bundler/dev server
// resolve and transpile the module correctly.
self.onmessage = async function (e) {
  const { fen, depth, pieceStates, aiOpponentModuleUrl } = e.data;

  try {
    let AIOpponentCtor = null;

    if (aiOpponentModuleUrl) {
      // Dynamic import respects bundler/dev server resolution (vite will handle .ts)
      const mod = await import(/* @vite-ignore */ aiOpponentModuleUrl);
      AIOpponentCtor = mod?.AIOpponent || mod?.default || null;
    }

    if (!AIOpponentCtor) {
      throw new Error('AIOpponent constructor not found via module import');
    }

    const chess = new Chess(fen);
    const ai = new AIOpponentCtor();
    const result = ai.getBestMove(chess, depth, pieceStates);
    self.postMessage(result);
  } catch (err) {
    // If dynamic import failed, return an error description to caller
    self.postMessage({ error: String(err) });
  }
};
