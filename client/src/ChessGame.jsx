import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChakraProvider, Box, VStack, HStack, Text, Button, Input, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react";
import { Chessboard } from "react-chessboard";
import { Chess } from 'chess.js';
import './ChessGame.css';

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
    const result = gameCopy.move(move);
    if (result) {
      setGame(gameCopy);

      if (isKingCaptured(gameCopy.fen())) {
        setGameOver(true);
        onOpen();
      }
    }
    return result;
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

  const generatePieceResponse = async (prompt, pieceType, pieceSquare) => {
    try {
      console.log('Sending request to server:', { prompt, board: game.fen(), pieceType, pieceSquare });
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt, 
          board: game.fen(), 
          pieceType: pieceType || 'unknown', 
          pieceSquare: pieceSquare || 'unknown' 
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Received response from server:', data);
      
      if (data.move) {
        console.log('Valid move received:', data.move);
        const from = data.move.slice(0, 2);
        const to = data.move.slice(2, 4);
        makeMove({ from, to });
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
      
      const { message, move } = await generatePieceResponse(messageToSend, pieceType, pieceSquare);
      addChatMessage(move ? `${pieceType || 'Piece'} at ${move.slice(0, 2)}` : `${pieceType || 'Piece'} at ${pieceSquare || 'unknown'}`, message);

      // Generate AI's next move
      if (!gameOver) {
        setTimeout(async () => {
          const aiPiece = getRandomAIPiece(game);
          const aiPrompt = `${aiPiece.type} at ${aiPiece.square}: Make a strategic move`;
          addChatMessage("Game", aiPrompt);
          const { message, move } = await generatePieceResponse(aiPrompt, aiPiece.type, aiPiece.square);
          addChatMessage(move ? `${aiPiece.type} at ${move.slice(0, 2)}` : `${aiPiece.type} at ${aiPiece.square}`, message);
        }, 1000);
      }
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
