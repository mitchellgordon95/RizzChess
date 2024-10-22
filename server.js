const express = require('express');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'client/build')));

app.post('/api/chat', async (req, res) => {
  try {
    const { prompt, board } = req.body;
    console.log('Received request:', { prompt, board });
    
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
      result = { 
        message: explanation, 
        move: move
      };
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
  const [position, color] = piece.match(/([A-H][1-8])/i)[0].split('');
  const pieceType = piece.replace(position, '').toLowerCase();
  const board = fen.split(' ')[0];
  const moves = [];

  const directions = {
    p: color === 'w' ? [[0, 1]] : [[0, -1]],
    r: [[0, 1], [0, -1], [1, 0], [-1, 0]],
    n: [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]],
    b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
    q: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
    k: [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  };

  const [file, rank] = [position.charCodeAt(0) - 65, parseInt(position[1]) - 1];

  for (const [dx, dy] of directions[pieceType]) {
    let newFile = file + dx;
    let newRank = rank + dy;
    if (newFile >= 0 && newFile < 8 && newRank >= 0 && newRank < 8) {
      const newPos = `${String.fromCharCode(newFile + 65)}${newRank + 1}`;
      const targetPiece = getPieceAt(board, newPos);
      moves.push(`${newPos}${targetPiece ? ` (${targetPiece} present)` : ''}`);
    }
  }

  return moves.join('\n');
}

function getPieceAt(fen, position) {
  const board = fen.split(' ')[0];
  const [file, rank] = position.split('');
  const fileIndex = file.charCodeAt(0) - 65;
  const rankIndex = 8 - parseInt(rank);

  const rows = board.split('/');
  let col = 0;
  for (const char of rows[rankIndex]) {
    if (isNaN(char)) {
      if (col === fileIndex) {
        return char;
      }
      col++;
    } else {
      col += parseInt(char);
    }
    if (col > fileIndex) break;
  }
  return null;
}

function boardToString(fen) {
  const board = fen.split(' ')[0];
  return board.split('/').map(row => 
    row.split('').map(char => 
      isNaN(char) ? char : '.'.repeat(parseInt(char))
    ).join(' ')
  ).join('\n');
}

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname+'/client/build/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
