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
    const claudePrompt = `You are playing as the ${piece} piece on a chess board. The current board state is:

${boardToString(board)}

The player has given you this command: "${command}"

Based on this command and your position on the board, suggest a valid chess move. 
Respond in this format: "MOVE:startRow,startCol,endRow,endCol" followed by a brief explanation of the move.
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

    const moveMatch = aiResponse.match(/MOVE:(\d+),(\d+),(\d+),(\d+)/);
    
    let result;
    if (moveMatch) {
      const [, startRow, startCol, endRow, endCol] = moveMatch.map(Number);
      const explanation = aiResponse.split('\n').slice(1).join('\n');
      result = { 
        message: explanation, 
        move: { startRow, startCol, endRow, endCol }
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
