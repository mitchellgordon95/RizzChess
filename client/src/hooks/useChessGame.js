import { useState, useCallback } from 'react';
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

const getRandomAIPiece = (game) => {
  const pieces = game.board().flat().filter(piece => piece && piece.color === 'b');
  const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
  return {
    type: randomPiece.type.toUpperCase(),
    square: randomPiece.square
  };
};

export const useChessGame = () => {
  const [game, setGame] = useState(new Chess());
  const [gameOver, setGameOver] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);

  const makeMove = useCallback((move) => {
      console.log(game.fen())
    const gameCopy = new Chess(game.fen());
    try {
      const result = gameCopy.move(move);
      if (result) {
        setGame(gameCopy);
        if (isKingCaptured(gameCopy.fen())) {
          setGameOver(true);
          return { result, gameOver: true };
        }
        return { result, gameOver: false };
      }
    } catch (error) {
      console.error('Invalid move:', move, error);
    }
    // If the move is invalid or an error occurred, switch turns
    gameCopy.setTurn(gameCopy.turn() === 'w' ? 'b' : 'w');
    setGame(gameCopy);
    return { result: null, gameOver: false };
  }, [game]);

  const resetGame = () => {
    setGame(new Chess());
    setGameOver(false);
    setChatMessages([]);
  };

  const addChatMessage = (sender, message) => {
    setChatMessages(prevMessages => [...prevMessages, { sender, message }]);
  };

  const generatePieceResponse = async (prompt, pieceType, pieceSquare, isAIMove = false) => {
    try {
      const turn = isAIMove ? 'b' : game.turn();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt, 
          board: game.fen(), 
          pieceType: pieceType || 'unknown', 
          pieceSquare: pieceSquare || 'unknown',
          turn
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.move) {
        const moveResult = makeMove(data.move);
        return { ...data, gameOver: moveResult.gameOver };
      }
      
      return data;
    } catch (error) {
      console.error("Error calling backend API:", error);
      return { message: "Sorry, I encountered an error while generating a response.", move: null };
    }
  };

  return {
    game,
    gameOver,
    chatMessages,
    makeMove,
    resetGame,
    addChatMessage,
    generatePieceResponse,
    getRandomAIPiece: () => getRandomAIPiece(game)
  };
};
