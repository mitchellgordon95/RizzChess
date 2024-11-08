import { useEffect, useRef } from 'react';

export const useStockfish = () => {
  const engineRef = useRef(null);

  useEffect(() => {
    // Initialize Stockfish
    const stockfish = new Worker(require('stockfish/stockfish.js'));
    
    stockfish.postMessage('uci');
    stockfish.postMessage('isready');
    
    engineRef.current = stockfish;

    // Cleanup on unmount
    return () => {
      if (engineRef.current) {
        engineRef.current.terminate();
      }
    };
  }, []);

  const getBestMove = (fen, depth = 15) => {
    return new Promise((resolve) => {
      if (!engineRef.current) return;

      const engine = engineRef.current;
      
      engine.onmessage = (event) => {
        const message = event.data;
        
        if (message.startsWith('bestmove')) {
          const move = message.split(' ')[1];
          resolve(move);
        }
      };

      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go depth ${depth}`);
    });
  };

  return { getBestMove };
};
