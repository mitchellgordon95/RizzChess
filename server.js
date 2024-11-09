const express = require('express');
const axios = require('axios');
const path = require('path');
const { Chess } = require('chess.js');

// Extend Chess class to add setTurn method
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
    const defendingPieces = [];
    chess.board().forEach((row, i) => {
      row.forEach((square, j) => {
        if (square && square.color === piece.color) {
          const targetSquare = String.fromCharCode(97 + j) + (8 - i);
          // Check if this piece controls squares around friendly pieces
          const testPosition = new Chess(chess.fen());
          const moves = testPosition.moves({ square: pieceSquare, verbose: true });
          if (moves.some(move => {
            // Check if the move's destination is on a line that passes through this friendly piece
            const dx = Math.abs(move.to.charCodeAt(0) - targetSquare.charCodeAt(0));
            const dy = Math.abs(move.to[1] - targetSquare[1]);
            return (dx === 0 && dy === 0) || // same square
                   (dx === dy) || // diagonal
                   (dx === 0 || dy === 0); // straight line
          })) {
            defendingPieces.push(`${square.type.toUpperCase()} at ${targetSquare}`);
          }
        }
      });
    });

    // Get pieces this piece is currently attacking
    const attackingPieces = [];
    chess.board().forEach((row, i) => {
      row.forEach((square, j) => {
        if (square && square.color !== piece.color) {
          const targetSquare = String.fromCharCode(97 + j) + (8 - i);
          const moves = chess.moves({ square: pieceSquare, verbose: true });
          if (moves.some(move => move.to === targetSquare)) {
            attackingPieces.push(`${square.type.toUpperCase()} at ${targetSquare}`);
          }
        }
      });
    });

    // Analyze potential moves
    const moveAnalysis = chess.moves({ square: pieceSquare }).map(move => {
      const testPosition = new Chess(chess.fen());
      testPosition.move(move);
      
      // Get pieces we would defend after this move
      const wouldDefend = [];
      testPosition.board().forEach((row, i) => {
        row.forEach((square, j) => {
          if (square && square.color === piece.color) {
            const targetSquare = String.fromCharCode(97 + j) + (8 - i);
            // Check if the moved piece would control squares around friendly pieces
            const moves = testPosition.moves({ square: move.slice(-2), verbose: true });
            if (moves.some(futureMove => {
              // Check if the move's destination is on a line that passes through this friendly piece
              const dx = Math.abs(futureMove.to.charCodeAt(0) - targetSquare.charCodeAt(0));
              const dy = Math.abs(futureMove.to[1] - targetSquare[1]);
              return (dx === 0 && dy === 0) || // same square
                     (dx === dy) || // diagonal
                     (dx === 0 || dy === 0); // straight line
            })) {
              wouldDefend.push(`${square.type.toUpperCase()} at ${targetSquare}`);
            }
          }
        });
      });

      // Get pieces we would attack after this move
      const wouldAttack = [];
      testPosition.board().forEach((row, i) => {
        row.forEach((square, j) => {
          if (square && square.color !== piece.color) {
            const targetSquare = String.fromCharCode(97 + j) + (8 - i);
            const moves = testPosition.moves({ square: move.slice(-2), verbose: true });
            if (moves.some(futureMove => futureMove.to === targetSquare)) {
              wouldAttack.push(`${square.type.toUpperCase()} at ${targetSquare}`);
            }
          }
        });
      });

      return {
        move,
        wouldDefend,
        wouldAttack
      };
    });

    const claudePrompt = `You are an AI assistant helping to play a chess game. 

The player has given this command: "${prompt}"

Current turn: ${chess.turn() === 'w' ? 'White' : 'Black'}

You are the ${pieceType} at ${pieceSquare}.

Current position analysis:
- Pieces you are defending: ${defendingPieces.length ? defendingPieces.join(', ') : 'none'}
- Pieces you are attacking: ${attackingPieces.length ? attackingPieces.join(', ') : 'none'}

Your valid moves and their effects:
${moveAnalysis.map(analysis => `
Move to ${analysis.move}:
- Would defend: ${analysis.wouldDefend.length ? analysis.wouldDefend.join(', ') : 'none'}
- Would attack: ${analysis.wouldAttack.length ? analysis.wouldAttack.join(', ') : 'none'}`).join('\n')}

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
