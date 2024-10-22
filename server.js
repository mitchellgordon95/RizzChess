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
    const { prompt, board, pieceType, pieceSquare } = req.body;
    console.log('Received request:', { prompt, board, pieceType, pieceSquare });
    
    const chess = new Chess(board);
    
    // Construct a prompt for Claude
    const claudePrompt = `You are an AI assistant helping to play a chess game. 

The player has given this command: "${prompt}"

Here are the valid moves for the ${pieceType} at ${pieceSquare}:
${chess.moves({ square: pieceSquare }).join(', ')}

Based on this command and the valid moves, suggest a chess move for the ${pieceType} at ${pieceSquare}. 
Respond in this format: "MOVE:e2e4" (replace e2e4 with your actual move) followed by a brief explanation of the move.
If no valid move is possible based on the command, respond with "INVALID" followed by an explanation.

Remember to roleplay as the ${pieceType}. Keep your explanation in character.`;

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

    const moveMatch = aiResponse.match(/MOVE:([a-h][1-8][a-h][1-8])/i);
    
    let result;
    if (moveMatch) {
      const [, move] = moveMatch;
      const explanation = aiResponse.split('\n').slice(1).join('\n').trim();
      
      // Validate the move using chess.js
      const chessMove = chess.move({
        from: move.slice(0, 2).toLowerCase(),
        to: move.slice(2, 4).toLowerCase(),
        promotion: 'q' // Always promote to queen for simplicity
      });
      
      if (chessMove) {
        result = { 
          message: explanation, 
          move: move.toLowerCase()
        };
      } else {
        result = { 
          message: "The suggested move is not valid. Let's try a different approach.", 
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
