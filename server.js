const express = require('express');
const axios = require('axios');
const path = require('path');
const { Chess } = require('chess.js');
require('dotenv').config();

const app = express();
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt, board } = req.body;
    console.log('Received request:', { prompt, board });
    
    const chess = new Chess(board);
    
    // Extract piece and command from the prompt
    const match = prompt.match(/@(\w+)(.+)/);
    if (!match) {
      console.log('Invalid command format');
      return res.json({ message: "I couldn't understand the command. Please use the format '@PiecePosition, command'.", move: null });
    }

    const [, piece, command] = match;
    console.log('Extracted piece and command:', { piece, command });

    // Construct a prompt for Claude
    const claudePrompt = `You are playing as the ${piece} piece on a chess board. Here are your valid moves based on your current position:

${getValidMoves(piece, board)}

The player has given you this command: "${command}"

Based on this command and your available moves, suggest a valid chess move. 
Respond in this format: "MOVE:e2e4" (replace e2e4 with your actual move) followed by a brief explanation of the move.
If the move is not valid or possible, respond with "INVALID" followed by an explanation.

Remember, you are roleplaying as the chess piece. Keep your explanation in character.`;

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

    const moveMatch = aiResponse.match(/MOVE:([a-h][1-8][a-h][1-8])/);
    
    let result;
    if (moveMatch) {
      const [, move] = moveMatch;
      const explanation = aiResponse.split('\n').slice(1).join('\n');
      
      // Validate the move using chess.js
      const chessMove = chess.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: 'q' // Always promote to queen for simplicity
      });
      
      if (chessMove) {
        result = { 
          message: explanation, 
          move: move
        };
      } else {
        result = { 
          message: "The suggested move is not valid. Please try another command.", 
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
        message: "I couldn't generate a valid move. Please try another command.", 
        move: null 
      };
    }

    console.log('Sending response to client:', result);
    return res.json(result);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'An error occurred while processing your request.' });
  }
});

function getValidMoves(piece, fen) {
  const chess = new Chess(fen);
  const [file, rank] = piece.slice(-2).toLowerCase().split('');
  const square = file + rank;
  
  const moves = chess.moves({ square: square, verbose: true });
  return moves.map(move => {
    const targetPiece = chess.get(move.to);
    return `${move.to}${targetPiece ? ` (${targetPiece.type} present)` : ''}`;
  }).join('\n');
}

function boardToString(fen) {
  const chess = new Chess(fen);
  return chess.ascii();
}

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname+'/client/build/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
