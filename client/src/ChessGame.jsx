import React, { useEffect, useRef, useState } from 'react';
import { ChakraProvider, Box, VStack, HStack, Text, Button, Input, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react";
import { Chessboard } from "react-chessboard";
import { useChessGame } from './hooks/useChessGame';
import './ChessGame.css';

const getPieceSymbol = (piece) => {
  if (!piece) return '';
  return piece.type.toUpperCase();
};

const ChessGame = () => {
  const { 
    game, 
    gameOver, 
    chatMessages, 
    resetGame, 
    addChatMessage, 
    generatePieceResponse,
    getRandomAIPiece 
  } = useChessGame();
  
  const [currentMessage, setCurrentMessage] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleGameReset = () => {
    resetGame();
    onClose();
  };

  const handleSendMessage = async () => {
    if (currentMessage.trim() === '') return;
    
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
    
    const response = await generatePieceResponse(messageToSend, pieceType, pieceSquare, false);
    addChatMessage(
      response.move ? 
        `${pieceType || 'Piece'} at ${response.move.slice(0, 2)}` : 
        `${pieceType || 'Piece'} at ${pieceSquare || 'unknown'}`, 
      response.message
    );

    if (response.gameOver) {
      onOpen();
      return;
    }

    // Generate AI's next move
    if (!gameOver) {
      setTimeout(async () => {
        const aiPiece = getRandomAIPiece();
        const aiPrompt = `${aiPiece.type} at ${aiPiece.square}: Make a strategic move`;
        addChatMessage("AI Opponent", aiPrompt);
        
        const aiResponse = await generatePieceResponse(aiPrompt, aiPiece.type, aiPiece.square, true);
        if (aiResponse.move) {
          addChatMessage(`${aiPiece.type} moves ${aiResponse.move}`, aiResponse.message);
          if (aiResponse.gameOver) {
            onOpen();
          }
        } else {
          addChatMessage("AI Opponent", "The AI couldn't make a valid move. Switching back to player's turn.");
        }
      }, 1000);
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
