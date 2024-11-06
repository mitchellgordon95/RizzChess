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

const getRandomAIPiece = (fen) => {
  const game = new Chess(fen);
  const pieces = game.board().flat().filter(piece => piece && piece.color === 'b');
  const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
  return {
    type: randomPiece.type.toUpperCase(),
    square: randomPiece.square
  };
};

export const useChessGame = () => {
  const [fen, setFen] = useState(new Chess().fen());
  const [gameOver, setGameOver] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);


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
    
    // Parse the message to get the piece type and square
    const match = messageToSend.match(/@([a-h][1-8])/);
    let pieceType, pieceSquare;
    
    if (match) {
      pieceSquare = match[1];
      const currentGame = new Chess(fen);
      const piece = currentGame.get(pieceSquare);
      if (piece) {
        pieceType = piece.type.toUpperCase();
      }
    }
    
    const response = await generatePieceResponse(messageToSend, pieceType, pieceSquare, fen);
    addChatMessage(
      response.move ? 
        `${pieceType || 'Piece'} at ${response.move.slice(0, 2)}` : 
        `${pieceType || 'Piece'} at ${pieceSquare || 'unknown'}`, 
      response.message
    );

    if (response.gameOver) {
      return { gameOver: true };
    }

    // Generate AI's next move
    if (!gameOver) {
      const aiPiece = getRandomAIPiece(fen);
      const aiPrompt = `${aiPiece.type} at ${aiPiece.square}: Make a strategic move`;
      addChatMessage("AI Opponent", aiPrompt);
      
      const aiResponse = await generatePieceResponse(aiPrompt, aiPiece.type, aiPiece.square, response.fen);
      if (aiResponse.move) {
        addChatMessage(`${aiPiece.type} moves ${aiResponse.move}`, aiResponse.message);
        if (aiResponse.gameOver) {
          return { gameOver: true };
        }
      } else {
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
