import { useState, useCallback } from 'react';
import { useStockfish } from './useStockfish';
import { Chess } from 'chess.js';

// Extend Chess class to add setTurn method
Chess.prototype.setTurn = function(turn) {
  if (turn !== 'w' && turn !== 'b') {
    throw new Error('Invalid turn. Must be "w" or "b".');
  }
  const fenParts = this.fen().split(' ');
  fenParts[1] = turn;
  this.load(fenParts.join(' '));
};

const isKingCaptured = (fen) => {
  const piecePlacement = fen.split(' ')[0];
  const whiteKing = piecePlacement.includes('K');
  const blackKing = piecePlacement.includes('k');
  return !whiteKing || !blackKing;
};



export const useChessGame = () => {
  const [fen, setFen] = useState(new Chess().fen());
  const [gameOver, setGameOver] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const { getBestMove } = useStockfish();


  const resetGame = () => {
    setFen(new Chess().fen());
    setGameOver(false);
    setChatMessages([]);
  };

  const handleSendMessage = useCallback(async (messageToSend) => {
    const addChatMessage = (sender, message) => {
      setChatMessages(prevMessages => [...prevMessages, { sender, message }]);
    };

    if (messageToSend.trim() === '') return;
    addChatMessage("Player", messageToSend);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: messageToSend,
          board: fen
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const { moves } = await response.json();
      
      // Process each move sequentially
      let currentFen = fen;
      for (const moveData of moves) {
        const game = new Chess(currentFen);
        game.setTurn('w');
        currentFen = game.fen();
        
        try {
          const result = game.move(moveData.move);
          if (result) {
            currentFen = game.fen();
            setFen(currentFen);
            addChatMessage(moveData.piece, moveData.message);
            
            if (isKingCaptured(currentFen)) {
              setGameOver(true);
              return { gameOver: true };
            }
          }
        } catch (error) {
          console.error('Invalid move:', moveData.move, error);
        }
      }

      // Generate AI's next move using Stockfish
      if (!gameOver) {
        addChatMessage("Stockfish", "Calculating best move...");
        
        const game = new Chess(currentFen);
        game.setTurn('b');
        currentFen = game.fen();
        setFen(currentFen);

        try {
          const bestMove = await getBestMove(currentFen);
          if (bestMove) {
            const gameCopy = new Chess(currentFen);
            const result = gameCopy.move(bestMove);
            if (result) {
              const newFen = gameCopy.fen();
              setFen(newFen);
              addChatMessage("Stockfish", `I think ${bestMove} is the best move.`);
              
              if (isKingCaptured(newFen)) {
                setGameOver(true);
                return { gameOver: true };
              }
            }
          }
        } catch (error) {
          console.error("Error getting AI move:", error);
          addChatMessage("Stockfish", "I couldn't calculate a valid move. Switching back to player's turn.");
        }
      }
      return { gameOver: false };
    } catch (error) {
      console.error("Error:", error);
      addChatMessage("System", error.message);
      return { gameOver: false };
    }
  }, [fen, gameOver, getBestMove]);

  return {
    fen,
    gameOver,
    chatMessages,
    resetGame,
    handleSendMessage
  };
};
