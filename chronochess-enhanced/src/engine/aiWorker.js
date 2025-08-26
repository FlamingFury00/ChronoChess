// AI Worker for ChronoChess - ES module version
import { Chess } from 'chess.js';

let AIOpponentCtor = null;
self.onmessage = function (e) {
  const { fen, depth, pieceStates, aiOpponentSource } = e.data;
  if (!AIOpponentCtor) {
    // Dynamically evaluate the AIOpponent class from source
    // eslint-disable-next-line no-eval
    AIOpponentCtor = eval(`(() => { ${aiOpponentSource}; return AIOpponent; })()`);
  }
  const chess = new Chess(fen);
  const ai = new AIOpponentCtor();
  const result = ai.getBestMove(chess, depth, pieceStates);
  self.postMessage(result);
};
