import React, { useState, useEffect } from 'react';
import { ChakraProvider, Box, VStack, HStack, Grid, GridItem, Text, Button, Input, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react";

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

  const makeMove = (startRow, startCol, endRow, endCol) => {
    const newBoard = board.map(row => [...row]);
    newBoard[endRow][endCol] = newBoard[startRow][startCol];
    newBoard[startRow][startCol] = null;
    setBoard(newBoard);
    setPlayerTurn(!playerTurn);

    // Check for game over condition (e.g., king captured)
    if (newBoard[endRow][endCol].toLowerCase() === 'k') {
      setGameOver(true);
      onOpen(); // Open the game over modal
    }
  };

  const makeAIMove = async () => {
    // AI move logic remains the same
    // ...

    setPlayerTurn(true);
  };

  const generateAIResponse = async (prompt) => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, board: board }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error calling backend API:", error);
      return { message: "Sorry, I encountered an error while generating a response.", move: null };
    }
  };

  const resetGame = () => {
    setBoard(initialBoard);
    setPlayerTurn(true);
    setGameOver(false);
    setChatMessages([]);
    onClose(); // Close the game over modal
  };

  const addChatMessage = (sender, message) => {
    setChatMessages(prevMessages => [...prevMessages, { sender, message }]);
  };

  const handleSendMessage = async () => {
    if (currentMessage.trim() !== '') {
      addChatMessage("You", currentMessage);
      
      const { message, move } = await generateAIResponse(currentMessage);
      addChatMessage("AI", message);

      if (move) {
        const { startRow, startCol, endRow, endCol } = move;
        makeMove(startRow, startCol, endRow, endCol);
      }

      setCurrentMessage('');
    }
  };

  return (
    <ChakraProvider>
      <Box p={4}>
        <HStack spacing={8} alignItems="flex-start">
          <VStack>
            <Text fontSize="2xl" fontWeight="bold" mb={4}>Chess Game Demo</Text>
            <Grid templateColumns="repeat(8, 1fr)" gap={1}>
              {board.map((row, rowIndex) => 
                row.map((piece, colIndex) => (
                  <GridItem
                    key={`${rowIndex}-${colIndex}`}
                    w="50px"
                    h="50px"
                    bg={(rowIndex + colIndex) % 2 === 0 ? "gray.200" : "gray.400"}
                    display="flex"
                    justifyContent="center"
                    alignItems="center"
                    fontSize="2xl"
                  >
                    {piece}
                  </GridItem>
                ))
              )}
            </Grid>
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
