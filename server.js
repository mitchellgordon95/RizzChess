const express = require('express');
const axios = require('axios');
const path = require('path');
const { Chess } = require('chess.js');
const { PIECE_PERSONALITIES, GAME_RULES } = require('./client/src/constants/piecePersonalities');

// Extend Chess class to add setTurn method
Chess.prototype.setTurn = function(turn) {
  if (turn !== 'w' && turn !== 'b') {
    throw new Error('Invalid turn. Must be "w" or "b".');
  }
  const fenParts = this.fen().split(' ');
  fenParts[1] = turn;
  this.load(fenParts.join(' '));
};

// Helper function to resolve implicit piece references
async function parseImplicitReferences(message, fen) {
  const game = new Chess(fen);
  
  const prompt = `${boardToString(fen)}
"${message}"

Return ONLY a JSON array of WHITE pieces that are implied to move in the message. Each object needs:
pieceType: P=pawn, N=knight, B=bishop, R=rook, Q=queen, K=king
squares: Array of squares that piece occupies

Examples:
"both knights attack!" -> [{"pieceType":"N","squares":["b1","g1"]}]
"queen, go take the pawn!" -> [{"pieceType":"Q","squares":["d1"]}]
"all pawns advance!" -> [{"pieceType":"P","squares":["a2","b2","c2","d2","e2","f2","g2","h2"]}]
"bishops and rooks, charge!" -> [{"pieceType":"B","squares":["c1","f1"]},{"pieceType":"R","squares":["a1","h1"]}]
"protect the king" -> []
"bishop, take the pawn" -> [{"pieceType":"B","squares":["c1"]}]
"no implicit references" -> []`;

  console.log('\nImplicit reference prompt:\n', prompt, '\n');

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });

    const content = response.data.content[0].text;
    console.log('\nImplicit reference response:\n', content, '\n');
    
    // Filter to ensure only white pieces are included
    const references = JSON.parse(content);
    return references.filter(ref => {
      // Check each square to verify it contains a white piece
      return ref.squares.every(square => {
        const piece = game.get(square);
        return piece && piece.color === 'w';
      });
    });
  } catch (error) {
    console.error('Error parsing implicit references:', error);
    return [];
  }
}

// Helper function to parse piece references from message
const parsePieceReferences = async (message, fen) => {
  const references = [];
  const invalidReferences = [];
  
  // Parse explicit @mentions
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

  // Parse implicit mentions
  const implicitRefs = await parseImplicitReferences(message, fen);
  for (const ref of implicitRefs) {
    for (const square of ref.squares) {
      references.push({
        square,
        pieceType: ref.pieceType
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

async function generatePieceResponse(message, pieceType, square, fen) {
  const game = new Chess(fen);
  const piece = game.get(square);
  if (!piece) return { move: null, message: "Invalid piece" };

  // Get all valid moves for this piece with their consequences
  const validMovesAnalysis = ['None'];
  const moves = game.moves({ 
    square: square,
    verbose: true 
  });

  // Analyze each possible move
  for (const move of moves) {
    const testGame = new Chess(fen);
    testGame.move(move);
    
    // Get the new square after the move
    const newSquare = move.to;
    
    // Analyze the resulting position
    const attackedAfterMove = getControlledPieces(testGame, newSquare, false);
    const defendedAfterMove = getControlledPieces(testGame, newSquare, true);
    const attackingAfterMove = getPiecesControllingSquare(testGame, newSquare, false);
    const defendingAfterMove = getPiecesControllingSquare(testGame, newSquare, true);
    
    validMovesAnalysis.push({
      move: move.san,
      consequences: {
        attacking: attackedAfterMove,
        defending: defendedAfterMove,
        attackedBy: attackingAfterMove,
        defendedBy: defendingAfterMove
      }
    });
  }

  const personality = PIECE_PERSONALITIES[pieceType];
  const attackedPieces = getControlledPieces(game, square, false);
  const defendedPieces = getControlledPieces(game, square, true);
  const attackingPieces = getPiecesControllingSquare(game, square, false);
  const defendingPieces = getPiecesControllingSquare(game, square, true);

  const claudePrompt = `You are a ${pieceType} chess piece at square ${square}. Your personality: ${personality.personality}
Your catchphrase is: "${personality.catchphrase}"
Your risk tolerance is: ${personality.riskTolerance}

Current game state:
${boardToString(fen)}

The player just said: "${message}"

Respond in character and suggest a chess move. Your response must be in this format:
MOVE: <algebraic move notation like Nf3 or e4>
MESSAGE: <your in-character response>

Rules:
1. You MUST choose your move from these options:
   - 'None' (don't move)
     Would attack: ${attackedPieces.length ? attackedPieces.join(', ') : 'nothing'}
     Would defend: ${defendedPieces.length ? defendedPieces.join(', ') : 'nothing'}
     Would be attacked by: ${attackingPieces.length ? attackingPieces.join(', ') : 'none'}
     Would be defended by: ${defendingPieces.length ? defendingPieces.join(', ') : 'none'}
   ${validMovesAnalysis.slice(1).map(analysis => 
     `- ${analysis.move}
       Would attack: ${analysis.consequences.attacking.length ? analysis.consequences.attacking.join(', ') : 'nothing'}
       Would defend: ${analysis.consequences.defending.length ? analysis.consequences.defending.join(', ') : 'nothing'}
       Would be attacked by: ${analysis.consequences.attackedBy.length ? analysis.consequences.attackedBy.join(', ') : 'none'}
       Would be defended by: ${analysis.consequences.defendedBy.length ? analysis.consequences.defendedBy.join(', ') : 'none'}`
   ).join('\n   ')}
2. Stay in character based on your personality
3. Consider your risk tolerance when choosing moves
4. Reference the current game state in your response
5. Use your catchphrase occasionally
6. Keep responses concise (1-2 sentences)`;

  console.log('\nPrompt for', pieceType, 'at', square, ':\n', claudePrompt, '\n');

  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-opus-20240229',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: claudePrompt
      }]
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01'
      }
    });

    const content = response.data.content[0].text;
    // Extract move and message using more flexible regex
    const moveMatch = content.match(/MOVE:\s*([A-Za-z0-9-]+)/i);
    const messageMatch = content.match(/MESSAGE:\s*(.*?)(?=\n|$)/i);

    if (moveMatch && messageMatch) {
      return {
        move: moveMatch[1],
        message: messageMatch[1].trim()
      };
    } else {
      console.error('Invalid response format from Claude:', content);
      return {
        move: null,
        message: "I'm not sure what move to make."
      };
    }
  } catch (error) {
    console.error('Error calling Claude API:', error);
    return {
      move: null,
      message: "Sorry, I'm having trouble thinking of a move."
    };
  }
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

    // Make parsePieceReferences async
    const { references, invalidReferences } = await parsePieceReferences(message, board);
    if (invalidReferences.length > 0) {
      throw new Error(`Invalid piece references: ${invalidReferences.map(ref => 
        `${ref.expectedType} at ${ref.square}`
      ).join(', ')}`);
    }

    // Generate all piece responses in parallel
    const responsePromises = references.map(({ pieceType, square }) => {
      const game = new Chess(board);
      game.setTurn('w');
      return generatePieceResponse(message, pieceType, square, game.fen())
        .then(response => ({
          pieceType,
          square,
          ...response
        }));
    });

    const responses = await Promise.all(responsePromises);
    
    // Filter valid moves and apply them sequentially
    const moves = [];
    let currentFen = board;
    const game = new Chess(currentFen);

    for (const response of responses) {
      if (response.move) {
        if (response.move === 'None') {
          // Add the response without making a move
          moves.push({
            move: null,
            message: response.message,
            piece: `${response.pieceType} at ${response.square}`
          });
        } else {
          try {
            // Reset to current position and try the move
            game.load(currentFen);
            game.setTurn('w');
            game.move(response.move);
            
            // If move was legal, add it to results and update position
            moves.push({
              move: response.move,
              message: response.message,
              piece: `${response.pieceType} at ${response.square}`
            });
            currentFen = game.fen();
          } catch (error) {
            console.error('Invalid move:', response.move, error);
          }
        }
      }
    }
    
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
