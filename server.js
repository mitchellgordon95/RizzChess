const express = require('express');
const axios = require('axios');
const path = require('path');
const { Chess } = require('chess.js');
const { PIECE_PERSONALITIES, GAME_RULES } = require('./client/src/constants/piecePersonalities');

// Helper function to parse piece references from message
const parsePieceReferences = (message, fen) => {
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

// Process pieces sequentially and return array of moves
async function processPieceMoves(message, initialBoard) {
  const game = new Chess(initialBoard);
  const { references, invalidReferences } = parsePieceReferences(message, initialBoard);
  
  if (invalidReferences.length > 0) {
    throw new Error(`Invalid piece references: ${invalidReferences.map(ref => 
      `${ref.expectedType} at ${ref.square}`
    ).join(', ')}`);
  }

  const moves = [];
  let currentFen = initialBoard;

  for (const { pieceType, square } of references) {
    // Ensure it's white's turn
    game.load(currentFen);
    game.setTurn('w');
    currentFen = game.fen();

    const response = await generatePieceResponse(message, pieceType, square, currentFen);
    
    if (response.move) {
      try {
        game.move(response.move);
        moves.push({
          move: response.move,
          message: response.message,
          piece: `${pieceType} at ${square}`
        });
        currentFen = game.fen();
      } catch (error) {
        console.error('Invalid move:', response.move, error);
      }
    }
  }

  return moves;
}

// Helper function to get controlled squares based on piece type and position
function getControlledSquares(chess, pieceSquare) {
  const piece = chess.get(pieceSquare);
  if (!piece) return [];
  
  const file = pieceSquare.charCodeAt(0) - 97; // Convert 'a' to 0, 'b' to 1, etc.
  const rank = 8 - parseInt(pieceSquare[1]); // Convert '1' to 7, '2' to 6, etc.
  const controlledSquares = [];

  switch (piece.type.toLowerCase()) {
    case 'p': // Pawn
      const direction = piece.color === 'w' ? -1 : 1;
      // Capture squares only (diagonal moves)
      if (file > 0 && rank + direction >= 0 && rank + direction < 8) {
        controlledSquares.push(`${String.fromCharCode(file + 96)}${8 - (rank + direction)}`);
      }
      if (file < 7 && rank + direction >= 0 && rank + direction < 8) {
        controlledSquares.push(`${String.fromCharCode(file + 98)}${8 - (rank + direction)}`);
      }
      break;
      
    case 'n': // Knight
      const knightMoves = [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1]
      ];
      for (const [dx, dy] of knightMoves) {
        const newFile = file + dx;
        const newRank = rank + dy;
        if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          controlledSquares.push(`${String.fromCharCode(newFile + 97)}${8 - newRank}`);
        }
      }
      break;
      
    case 'b': // Bishop
      for (const [dx, dy] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        let newFile = file + dx;
        let newRank = rank + dy;
        while (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          const square = `${String.fromCharCode(newFile + 97)}${8 - newRank}`;
          controlledSquares.push(square);
          if (chess.get(square)) break; // Stop at first piece encountered
          newFile += dx;
          newRank += dy;
        }
      }
      break;
      
    case 'r': // Rook
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let newFile = file + dx;
        let newRank = rank + dy;
        while (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          const square = `${String.fromCharCode(newFile + 97)}${8 - newRank}`;
          controlledSquares.push(square);
          if (chess.get(square)) break; // Stop at first piece encountered
          newFile += dx;
          newRank += dy;
        }
      }
      break;
      
    case 'q': // Queen (combination of bishop and rook moves)
      for (const [dx, dy] of [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
      ]) {
        let newFile = file + dx;
        let newRank = rank + dy;
        while (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          const square = `${String.fromCharCode(newFile + 97)}${8 - newRank}`;
          controlledSquares.push(square);
          if (chess.get(square)) break; // Stop at first piece encountered
          newFile += dx;
          newRank += dy;
        }
      }
      break;
      
    case 'k': // King
      for (const [dx, dy] of [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1], [0, 1],
        [1, -1], [1, 0], [1, 1]
      ]) {
        const newFile = file + dx;
        const newRank = rank + dy;
        if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
          controlledSquares.push(`${String.fromCharCode(newFile + 97)}${8 - newRank}`);
        }
      }
      break;
  }
  
  return controlledSquares;
}

// Helper function to get pieces being attacked or defended
function getControlledPieces(chess, pieceSquare, isDefending = false) {
  const controlledSquares = getControlledSquares(chess, pieceSquare);
  const piece = chess.get(pieceSquare);
  const controlledPieces = [];
  
  for (const square of controlledSquares) {
    const targetPiece = chess.get(square);
    if (targetPiece) {
      if (isDefending ? targetPiece.color === piece.color : targetPiece.color !== piece.color) {
        controlledPieces.push(`${targetPiece.type.toUpperCase()} at ${square}`);
      }
    }
  }
  
  return controlledPieces;
}

// Helper function to get pieces attacking or defending a specific square
function getPiecesControllingSquare(chess, targetSquare, isDefending = false) {
  const targetPiece = chess.get(targetSquare);
  if (!targetPiece) return [];
  
  const controllingPieces = [];
  const board = chess.board();
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const square = `${String.fromCharCode(97 + file)}${8 - rank}`;
        if (square !== targetSquare) {
          const controlledSquares = getControlledSquares(chess, square);
          if (controlledSquares.includes(targetSquare)) {
            if (isDefending ? piece.color === targetPiece.color : piece.color !== targetPiece.color) {
              controllingPieces.push(`${piece.type.toUpperCase()} at ${square}`);
            }
          }
        }
      }
    }
  }
  
  return controllingPieces;
}

require('dotenv').config();

const app = express();
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.post('/api/chat', async (req, res) => {
  try {
    const { message, board } = req.body;
    console.log('Received request:', { message, board });

    const moves = await processPieceMoves(message, board);
    
    console.log('Sending response to client:', moves);
    return res.json({ moves });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

function boardToString(fen) {
  const chess = new Chess(fen);
  return chess.ascii();
}

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname+'/client/build/index.html'));
});

function findMoveBetweenPositions(oldPosition, newPosition) {
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const square = String.fromCharCode(97 + j) + (8 - i);
      const oldPiece = oldPosition.get(square);
      const newPiece = newPosition.get(square);
      
      if (oldPiece && !newPiece) {
        // A piece was moved from this square
        for (let x = 0; x < 8; x++) {
          for (let y = 0; y < 8; y++) {
            const targetSquare = String.fromCharCode(97 + x) + (8 - y);
            if (oldPosition.get(targetSquare) !== newPosition.get(targetSquare)) {
              return square + targetSquare;
            }
          }
        }
      }
    }
  }
  return null;
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`Claude API Key configured: ${!!process.env.CLAUDE_API_KEY}`);
});
