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

const getRandomAIPiece = (fen) => {
  const game = new Chess(fen);
  const pieces = game.board().flat().filter(piece => piece && piece.color === 'b');
  const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
  return {
    type: randomPiece.type.toUpperCase(),
    square: randomPiece.square
  };
};

export const parsePieceReferences = (message, fen) => {
  const references = [];
  const invalidReferences = [];
  const matches = message.match(/@([a-h][1-8][RNBQKP])/g) || [];
  
  const game = new Chess(fen);
  
  for (const match of matches) {
    const square = match.slice(1, 3);
    const expectedType = match[3];
    const piece = game.get(square);
    
    if (piece && piece.type.toUpperCase() === expectedType) {
      references.push({
        square,
        pieceType: piece.type.toUpperCase()
      });
    } else {
      invalidReferences.push({
        square,
        expectedType
      });
    }
  }
  
  return { references, invalidReferences };
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

    const generatePieceResponse = async (prompt, pieceType, pieceSquare, _fen) => {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            prompt, 
            board: _fen, 
            pieceType: pieceType || 'unknown', 
            pieceSquare: pieceSquare || 'unknown',
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.move) {
          console.log(_fen)
          const gameCopy = new Chess(_fen);
          try {
            const result = gameCopy.move(data.move);
            if (result) {
              const newFen = gameCopy.fen();
              const isGameOver = isKingCaptured(newFen);
              setFen(newFen);
              if (isGameOver) {
                setGameOver(true);
              }
              return { ...data, gameOver: isGameOver, fen: newFen };
            }
            return { ...data, gameOver: false, fen: _fen };
          } catch (error) {
            console.error('Invalid move:', data.move, error);
            // If an error occurred, switch turns
            gameCopy.setTurn(gameCopy.turn() === 'w' ? 'b' : 'w');
            const newFen = gameCopy.fen();
            setFen(newFen);
            return { ...data, gameOver: false, fen: newFen };
          }
        }
        
        // No move
        return { ...data, fen: _fen};
      } catch (error) {
        console.error("Error calling backend API:", error);
        return { message: "Sorry, I encountered an error while generating a response.", move: null };
      }
    };
    if (messageToSend.trim() === '') return;
    addChatMessage("Player", messageToSend);

    // Get all piece references from the message
    const { references } = parsePieceReferences(messageToSend, fen);
    let currentFen = fen;
    
    // Process each piece's move sequentially
    for (const { pieceType, square } of references) {
      // Ensure it's white's turn before generating response
      const game = new Chess(currentFen);
      game.setTurn('w');
      currentFen = game.fen();
      setFen(currentFen);

      const response = await generatePieceResponse(
        messageToSend, 
        pieceType, 
        square, 
        currentFen
      );

      addChatMessage(
        response.move ? 
          `${pieceType} at ${response.move.slice(0, 2)}` : 
          `${pieceType} at ${square}`, 
        response.message
      );

      if (response.gameOver) {
        return { gameOver: true };
      }

      // Update the current board state for the next piece
      if (response.fen) {
        currentFen = response.fen;
      }
    }

    // Generate AI's next move using Stockfish
    if (!gameOver) {
      const aiPiece = getRandomAIPiece(fen);
      const aiPrompt = `${aiPiece.type} at ${aiPiece.square}: Make a strategic move`;
      addChatMessage("AI Opponent", aiPrompt);
      
      // Ensure it's black's turn before generating response
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
            const isGameOver = isKingCaptured(newFen);
            setFen(newFen);
            addChatMessage(`${aiPiece.type} moves ${bestMove}`, "I made what I believe is the best move.");
            if (isGameOver) {
              return { gameOver: true };
            }
          }
        }
      } catch (error) {
        console.error("Error getting AI move:", error);
        addChatMessage("AI Opponent", "The AI couldn't make a valid move. Switching back to player's turn.");
      }
    }
    return { gameOver: false };
  }, [fen, gameOver]);

  return {
    fen,
    gameOver,
    chatMessages,
    resetGame,
    handleSendMessage
  };
};
