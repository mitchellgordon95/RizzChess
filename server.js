const express = require('express');
const axios = require('axios');
const path = require('path');
const { Chess } = require('chess.js');
const { PIECE_PERSONALITIES, GAME_RULES } = require('./client/src/constants/piecePersonalities');

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
    const { prompt, board, pieceType, pieceSquare} = req.body;
    console.log('Received request:', { prompt, board, pieceType, pieceSquare});
    
    const chess = new Chess(board);
    
    // Construct a prompt for Claude
    // Analyze current position
    const currentColor = chess.turn();
    const piece = chess.get(pieceSquare);
    
    // Get pieces this piece is currently defending
    const defendingPieces = getControlledPieces(chess, pieceSquare, true);

    // Get pieces this piece is currently attacking
    const attackingPieces = getControlledPieces(chess, pieceSquare, false);

    // Get pieces currently defending/attacking this piece
    const currentlyDefendedBy = getPiecesControllingSquare(chess, pieceSquare, true);
    const currentlyAttackedBy = getPiecesControllingSquare(chess, pieceSquare, false);

    // Analyze potential moves
    const moveAnalysis = chess.moves({ square: pieceSquare }).map(move => {
      const testPosition = new Chess(chess.fen());
      testPosition.move(move);
      const targetSquare = move.slice(-2);
      
      // Get pieces we would defend after this move
      const wouldDefend = getControlledPieces(testPosition, targetSquare, true);

      // Get pieces we would attack after this move
      const wouldAttack = getControlledPieces(testPosition, targetSquare, false);

      // Get pieces that would defend/attack us in the new position
      const wouldBeDefendedBy = getPiecesControllingSquare(testPosition, targetSquare, true);
      const wouldBeAttackedBy = getPiecesControllingSquare(testPosition, targetSquare, false);

      return {
        move,
        wouldDefend,
        wouldAttack,
        wouldBeDefendedBy,
        wouldBeAttackedBy
      };
    });

    // Import personality for this piece type
    const personality = PIECE_PERSONALITIES[pieceType] || {
      personality: "Disciplined soldier",
      catchphrase: "Ready for action!",
      riskTolerance: "medium"
    };

    const claudePrompt = `You are a chess piece with a distinct personality helping to play a chess game.

The player has given this command: "${prompt}"

Current turn: ${chess.turn() === 'w' ? 'White' : 'Black'}

Your Identity:
- You are the ${pieceType} at ${pieceSquare}
- Personality: ${personality.personality}
- Catchphrase: ${personality.catchphrase}
- Risk tolerance: ${personality.riskTolerance}

Game Rules:
- You can normally only move once per turn
- You must follow standard chess movement patterns
- Breaking these rules is possible but extremely taxing
- You are a loyal soldier who values both duty and survival

Current position analysis:
- Pieces you are defending: ${defendingPieces.length ? defendingPieces.join(', ') : 'none'}
- Pieces you are attacking: ${attackingPieces.length ? attackingPieces.join(', ') : 'none'}
- Pieces defending you: ${currentlyDefendedBy.length ? currentlyDefendedBy.join(', ') : 'none'}
- Pieces attacking you: ${currentlyAttackedBy.length ? currentlyAttackedBy.join(', ') : 'none'}

Your valid moves and their effects:
${moveAnalysis.map(analysis => `
Move to ${analysis.move}:
- Would defend: ${analysis.wouldDefend.length ? analysis.wouldDefend.join(', ') : 'none'}
- Would attack: ${analysis.wouldAttack.length ? analysis.wouldAttack.join(', ') : 'none'}
- Would be defended by: ${analysis.wouldBeDefendedBy.length ? analysis.wouldBeDefendedBy.join(', ') : 'none'}
- Would be attacked by: ${analysis.wouldBeAttackedBy.length ? analysis.wouldBeAttackedBy.join(', ') : 'none'}`).join('\n')}

Note that other pieces might move before or after you in this turn.
Based on this command and your valid moves, suggest a chess move.
Respond in this format: "MOVE:[ALGEBRAIC]" (replace [ALGEBRAIC] with the algebraic notation of the move) followed by a very brief explanation (1-2 sentences max).
If no valid move is possible based on the command, respond with "INVALID" followed by a single sentence explanation.

Remember to roleplay as the ${pieceType}, but keep responses short and direct.`;

    console.log('Sending prompt to Claude:', claudePrompt);

    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1024,
      messages: [
        { role: "user", content: claudePrompt }
      ]
    }, {
      headers: {
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      }
    });

    const aiResponse = response.data.content[0].text;
    console.log('Received response from Claude:', aiResponse);

    const moveMatch = aiResponse.match(/MOVE:(\S+)/i);
    
    let result;
    if (moveMatch) {
      const [, move] = moveMatch;
      const explanation = aiResponse.split('\n').slice(1).join('\n').trim();
      
      try {
        const currentPosition = new Chess(board);
        const moveResult = currentPosition.move(move);
        
        if (moveResult) {
          result = { 
            message: explanation, 
            move: move
          };
        } else {
          throw new Error("Invalid move");
        }
      } catch (error) {
        console.error('Error processing move:', error);
        result = { 
          message: `The suggested move ${move} is not valid for the current board state. Let's try a different approach.`, 
          move: null 
        };
      }
    } else if (aiResponse.includes("INVALID")) {
      result = { 
        message: aiResponse.replace("INVALID", "").trim(), 
        move: null 
      };
    } else {
      result = { 
        message: "I couldn't generate a valid move based on that command. Let's try something else.", 
        move: null 
      };
    }

    console.log('Processed result:', result);

    console.log('Sending response to client:', result);
    return res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
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
