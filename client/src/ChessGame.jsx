import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
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
    fen,
    gameOver, 
    chatMessages, 
    resetGame, 
    handleSendMessage, 
  } = useChessGame();
  
  const [currentMessage, setCurrentMessage] = useState('');
  const [highlightedSquares, setHighlightedSquares] = useState({});
  const { isOpen, onOpen, onClose } = useDisclosure();
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleMessageSubmit = async () => {
    if (currentMessage.trim() === '') return;
    
    const messageToSend = currentMessage;
    setCurrentMessage(''); // Clear the input immediately
    
    const result = await handleSendMessage(messageToSend);
    if (result.gameOver) {
      onOpen();
    }
  };

  const getHighlightColor = (index) => {
    const colors = [
      'rgba(255, 255, 0, 0.4)',  // yellow
      'rgba(0, 255, 0, 0.4)',    // green
      'rgba(0, 255, 255, 0.4)',  // cyan
      'rgba(255, 0, 255, 0.4)',  // magenta
    ];
    return colors[index % colors.length];
  };

  const updateHighlightedSquares = (message) => {
    const squares = {};
    const matches = message.match(/@([a-h][1-8][RNBQKP])/g) || [];
    
    matches.forEach((match, index) => {
      const square = match.substring(1, 3);
      squares[square] = {
        background: getHighlightColor(index),
        borderRadius: '50%'
      };
    });
    
    setHighlightedSquares(squares);
  };

  const handleSquareClick = (square) => {
    const game = new Chess(fen);
    const piece = game.get(square);
    if (piece) {
      const pieceSymbol = getPieceSymbol(piece);
      const reference = `@${square}${pieceSymbol}`;
      
      // If the square is already highlighted, remove all references to it
      if (highlightedSquares[square]) {
        const newMessage = currentMessage.replace(new RegExp(reference, 'g'), '');
        setCurrentMessage(newMessage);
        updateHighlightedSquares(newMessage);
      } else {
        // Add new reference
        const newMessage = `${currentMessage}${reference} `;
        setCurrentMessage(newMessage);
        updateHighlightedSquares(newMessage);
      }
    }
  };

  return (
    <ChakraProvider>
      <Box p={4} maxW="600px" mx="auto">
        <VStack spacing={8} align="stretch">
          <VStack>
            <Text fontSize="2xl" fontWeight="bold" mb={4}>Rizz Chess</Text>
            <Box width="100%" maxW="500px" height="500px">
              <Chessboard 
                position={fen} 
                boardOrientation="white"
                onSquareClick={handleSquareClick}
                customSquareStyles={highlightedSquares}
              />
            </Box>
            <Text mt={4} fontSize="lg">
              {gameOver ? "Game Over!" : "Chat with the pieces"}
            </Text>
            <Button colorScheme="blue" onClick={resetGame} mt={4}>
              Reset Game
            </Button>
          </VStack>
          
          <VStack bg="gray.100" p={4} borderRadius="md" alignItems="stretch">
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
                minW="200px"
                value={currentMessage}
                onChange={(e) => {
                  setCurrentMessage(e.target.value);
                  updateHighlightedSquares(e.target.value);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleMessageSubmit();
                  }
                }}
                placeholder="Chat with the pieces..."
              />
              <Button onClick={handleMessageSubmit}>Send</Button>
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
