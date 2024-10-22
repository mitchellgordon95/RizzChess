import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChakraProvider, Box, VStack, HStack, Text, Button, Input, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react";
import { Chessboard } from "react-chessboard";
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
import './ChessGame.css';

const getPieceSymbol = (piece) => {
  if (!piece) return '';
  return piece.type.toUpperCase();
};

const isKingCaptured = (fen) => {
  const piecePlacement = fen.split(' ')[0];
  const whiteKing = piecePlacement.includes('K');
  const blackKing = piecePlacement.includes('k');
  return !whiteKing || !blackKing;
};

const getRandomAIPiece = (game) => {
  const pieces = game.board().flat().filter(piece => piece && piece.color === 'b');
  const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
  return {
    type: randomPiece.type.toUpperCase(),
    square: randomPiece.square
  };
};

const ChessGame = () => {
  const [game, setGame] = useState(new Chess());
  const [gameOver, setGameOver] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const makeMove = useCallback((move) => {
    const gameCopy = new Chess(game.fen());
    try {
      const result = gameCopy.move(move);
      if (result) {
        setGame(gameCopy);

        if (isKingCaptured(gameCopy.fen())) {
          setGameOver(true);
          onOpen();
        }
        return result;
      }
    } catch (error) {
      console.error('Invalid move:', move, error);
    }
    // If the move is invalid or an error occurred, switch turns
    gameCopy.setTurn(gameCopy.turn() === 'w' ? 'b' : 'w');
    setGame(gameCopy);
    return null;
  }, [game, onOpen]);

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setGameOver(false);
    setChatMessages([]);
    onClose();
  };

  const addChatMessage = (sender, message) => {
    setChatMessages(prevMessages => [...prevMessages, { sender, message }]);
  };

  const generatePieceResponse = async (prompt, pieceType, pieceSquare, isAIMove = false) => {
    try {
      const turn = isAIMove ? 'b' : game.turn();
      console.log('Sending request to server:', { prompt, board: game.fen(), pieceType, pieceSquare, turn });
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt, 
          board: game.fen(), 
          pieceType: pieceType || 'unknown', 
          pieceSquare: pieceSquare || 'unknown',
          turn
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received response from server:', data);
      
      if (data.move) {
        console.log('Valid move received:', data.move);
        makeMove(data.move);
      } else {
        console.log('No valid move in the response');
      }
      
      return data;
    } catch (error) {
      console.error("Error calling backend API:", error);
      return { message: "Sorry, I encountered an error while generating a response.", move: null };
    }
  };

  const handleSendMessage = async () => {
    if (currentMessage.trim() !== '') {
      const messageToSend = currentMessage;
      setCurrentMessage(''); // Clear the input immediately
      
      addChatMessage("Player", messageToSend);
      
      // Parse the message to get the piece type and square
      const match = messageToSend.match(/@([a-h][1-8])/);
      let pieceType, pieceSquare;
      
      if (match) {
        pieceSquare = match[1];
        const piece = game.get(pieceSquare);
        if (piece) {
          pieceType = piece.type.toUpperCase();
        }
      }
      
      const { message, move } = await generatePieceResponse(messageToSend, pieceType, pieceSquare, false);
      addChatMessage(move ? `${pieceType || 'Piece'} at ${move.slice(0, 2)}` : `${pieceType || 'Piece'} at ${pieceSquare || 'unknown'}`, message);

      // Generate AI's next move
      if (!gameOver) {  // Generate AI move even if player's move was invalid
        setTimeout(async () => {
          const aiPiece = getRandomAIPiece(game);
          const aiPrompt = `${aiPiece.type} at ${aiPiece.square}: Make a strategic move`;
          addChatMessage("Game", aiPrompt);
          const aiResponse = await generatePieceResponse(aiPrompt, aiPiece.type, aiPiece.square, true);
          if (aiResponse.move) {
            addChatMessage(`${aiPiece.type} moves ${aiResponse.move}`, aiResponse.message);
          } else {
            addChatMessage("Game", "The AI couldn't make a valid move. Switching back to player's turn.");
            const gameCopy = new Chess(game.fen());
            gameCopy.setTurn('w');
            setGame(gameCopy);
          }
        }, 1000);
      }
    }
  };

  const handleSquareClick = (square) => {
    const piece = game.get(square);
    if (piece) {
      const pieceSymbol = getPieceSymbol(piece);
      setCurrentMessage(prevMessage => `${prevMessage}@${square}${pieceSymbol} `);
    }
  };

  return (
    <ChakraProvider>
      <Box p={4}>
        <HStack spacing={8} alignItems="flex-start">
          <VStack>
            <Text fontSize="2xl" fontWeight="bold" mb={4}>Chess Game Demo</Text>
            <Box width="400px" height="400px">
              <Chessboard 
                position={game.fen()} 
                boardOrientation="white"
                onSquareClick={handleSquareClick}
              />
            </Box>
            <Text mt={4} fontSize="lg">
              {gameOver ? "Game Over!" : "Chat with the pieces"}
            </Text>
            <Button colorScheme="blue" onClick={resetGame} mt={4}>
              Reset Game
            </Button>
          </VStack>
          
          <VStack width="300px" bg="gray.100" p={4} borderRadius="md" alignItems="stretch">
            <Text fontSize="xl" fontWeight="bold" mb={4}>Chat</Text>
            <Box ref={chatContainerRef} height="300px" overflowY="auto" mb={4} bg="white" p={2} borderRadius="md">
              {chatMessages.map((msg, index) => (
                <Text key={index} mb={2}>
                  <strong>{msg.sender}: </strong>{msg.message}
                </Text>
              ))}
            </Box>
            <HStack>
              <Input
                value={currentMessage}
                onChange={(e) => setCurrentMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSendMessage();
                  }
                }}
                placeholder="Chat with the pieces..."
              />
              <Button onClick={handleSendMessage}>Send</Button>
            </HStack>
          </VStack>
        </HStack>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Game Over!</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            The game has ended. A king has been captured!
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={resetGame}>
              Play Again
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </ChakraProvider>
  );
};

export default ChessGame;
