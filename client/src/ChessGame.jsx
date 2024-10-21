import React, { useState, useEffect, useCallback } from 'react';
import { ChakraProvider, Box, VStack, HStack, Text, Button, Input, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react";
import { Chessboard } from "react-chessboard";
import { Chess } from 'chess.js';
import './ChessGame.css';

const ChessGame = () => {
  const [game, setGame] = useState(new Chess());
  const [playerTurn, setPlayerTurn] = useState(true);
  const [gameOver, setGameOver] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    if (!playerTurn && !gameOver) {
      setTimeout(makeAIMove, 500);
    }
  }, [playerTurn, gameOver]);

  const makeMove = useCallback((move) => {
    const gameCopy = new Chess(game.fen());
    const result = gameCopy.move(move);
    if (result) {
      setGame(gameCopy);
      setPlayerTurn(prevTurn => !prevTurn);

      if (gameCopy.game_over()) {
        setGameOver(true);
        onOpen();
      }
    }
    return result;
  }, [game, onOpen]);

  function onDrop(sourceSquare, targetSquare) {
    const move = makeMove({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q', // always promote to a queen for example simplicity
    });

    // illegal move
    if (move === null) return false;
    return true;
  }

  const makeAIMove = async () => {
    // AI move logic remains the same
    // You'll need to adapt this to work with the new game state
    setPlayerTurn(true);
  };

  const generateAIResponse = async (prompt) => {
    try {
      console.log('Sending request to server:', { prompt, board: game.fen() });
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, board: game.fen() }),
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

  const resetGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setPlayerTurn(true);
    setGameOver(false);
    setChatMessages([]);
    onClose();
  };

  const addChatMessage = (sender, message) => {
    setChatMessages(prevMessages => [...prevMessages, { sender, message }]);
  };

  const handleSendMessage = async () => {
    if (currentMessage.trim() !== '') {
      addChatMessage("You", currentMessage);
      
      const { message } = await generateAIResponse(currentMessage);
      addChatMessage("AI", message);

      setCurrentMessage('');
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
                onPieceDrop={onDrop}
                boardOrientation={playerTurn ? "white" : "black"}
              />
            </Box>
            <Text mt={4} fontSize="lg">
              {gameOver ? "Game Over!" : (playerTurn ? "Your turn" : "AI's turn")}
            </Text>
            <Button colorScheme="blue" onClick={resetGame} mt={4}>
              Reset Game
            </Button>
          </VStack>
          
          <VStack width="300px" bg="gray.100" p={4} borderRadius="md" alignItems="stretch">
            <Text fontSize="xl" fontWeight="bold" mb={4}>Chat</Text>
            <Box height="300px" overflowY="auto" mb={4} bg="white" p={2} borderRadius="md">
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
                placeholder="Type a command (e.g., @PawnE2, move forward)"
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
            {playerTurn ? "AI wins!" : "You win!"}
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
