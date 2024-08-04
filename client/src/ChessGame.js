import React, { useState, useEffect } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const initialBoard = [
  ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
  ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  Array(8).fill(null),
  ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
  ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

const ChessGame = () => {
  const [board, setBoard] = useState(initialBoard);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [playerTurn, setPlayerTurn] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');

  useEffect(() => {
    if (!playerTurn && !gameOver) {
      setTimeout(makeAIMove, 500);
    }
  }, [playerTurn, gameOver]);

  const isValidMove = (startRow, startCol, endRow, endCol) => {
    // This is a placeholder for move validation
    // In a real chess game, you'd implement proper move validation here
    return true;
  };

  const makeMove = (startRow, startCol, endRow, endCol) => {
    const newBoard = board.map(row => [...row]);
    newBoard[endRow][endCol] = newBoard[startRow][startCol];
    newBoard[startRow][startCol] = null;
    setBoard(newBoard);
    setPlayerTurn(!playerTurn);

    // Check for game over condition (e.g., king captured)
    if (newBoard[endRow][endCol].toLowerCase() === 'k') {
      setGameOver(true);
    }
  };

  const handleClick = (row, col) => {
    if (!playerTurn || gameOver) return;

    if (selectedPiece) {
      const [startRow, startCol] = selectedPiece;
      if (isValidMove(startRow, startCol, row, col)) {
        makeMove(startRow, startCol, row, col);
        setSelectedPiece(null);
      } else {
        setSelectedPiece(null);
      }
    } else if (board[row][col] && board[row][col].toUpperCase() === board[row][col]) {
      setSelectedPiece([row, col]);
    }
  };

  const makeAIMove = async () => {
    const availableMoves = [];
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (board[i][j] && board[i][j].toLowerCase() === board[i][j]) {
          for (let x = 0; x < 8; x++) {
            for (let y = 0; y < 8; y++) {
              if (isValidMove(i, j, x, y)) {
                availableMoves.push([i, j, x, y]);
              }
            }
          }
        }
      }
    }

    if (availableMoves.length > 0) {
      const [startRow, startCol, endRow, endCol] = availableMoves[Math.floor(Math.random() * availableMoves.length)];
      makeMove(startRow, startCol, endRow, endCol);
      
      // Generate AI response using backend API
      const aiResponse = await generateAIResponse("I've made my move. It's your turn now. What's your strategy?");
      addChatMessage("AI", aiResponse);
    } else {
      setGameOver(true);
    }
  };

  const generateAIResponse = async (prompt) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.message;
    } catch (error) {
      console.error("Error calling backend API:", error);
      return "Sorry, I encountered an error while generating a response.";
    }
  };

  const resetGame = () => {
    setBoard(initialBoard);
    setSelectedPiece(null);
    setPlayerTurn(true);
    setGameOver(false);
    setChatMessages([]);
  };

  const addChatMessage = (sender, message) => {
    setChatMessages(prevMessages => [...prevMessages, { sender, message }]);
  };

  const handleSendMessage = async () => {
    if (currentMessage.trim() !== '') {
      addChatMessage("You", currentMessage);
      const aiResponse = await generateAIResponse(currentMessage);
      addChatMessage("AI", aiResponse);
      setCurrentMessage('');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="flex items-start">
        <div className="flex flex-col items-center">
          <h1 className="text-3xl font-bold mb-4">Chess Game Demo</h1>
          <div className="bg-white p-4 rounded shadow-lg">
            {board.map((row, rowIndex) => (
              <div key={rowIndex} className="flex">
                {row.map((piece, colIndex) => (
                  <div
                    key={colIndex}
                    className={`w-12 h-12 flex items-center justify-center text-2xl cursor-pointer ${
                      (rowIndex + colIndex) % 2 === 0 ? 'bg-gray-200' : 'bg-gray-400'
                    } ${selectedPiece && selectedPiece[0] === rowIndex && selectedPiece[1] === colIndex ? 'border-2 border-blue-500' : ''}`}
                    onClick={() => handleClick(rowIndex, colIndex)}
                  >
                    {piece}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-4 text-lg">
            {gameOver ? "Game Over!" : (playerTurn ? "Your turn" : "AI's turn")}
          </p>
          <button
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={resetGame}
          >
            Reset Game
          </button>
        </div>
        
        <div className="ml-8 w-64 bg-white p-4 rounded shadow-lg">
          <h2 className="text-xl font-bold mb-4">Chat</h2>
          <div className="h-80 overflow-y-auto mb-4">
            {chatMessages.map((msg, index) => (
              <div key={index} className="mb-2">
                <span className="font-bold">{msg.sender}: </span>
                <span>{msg.message}</span>
              </div>
            ))}
          </div>
          <div className="flex">
            <Input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-grow mr-2"
            />
            <Button onClick={handleSendMessage}>Send</Button>
          </div>
        </div>
      </div>

      <AlertDialog open={gameOver}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Game Over!</AlertDialogTitle>
            <AlertDialogDescription>
              {playerTurn ? "AI wins!" : "You win!"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={resetGame}>Play Again</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChessGame;
