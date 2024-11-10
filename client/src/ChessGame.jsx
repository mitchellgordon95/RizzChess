import React, { useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { ChakraProvider, Box, VStack, HStack, Text, Button, Input, useDisclosure, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton } from "@chakra-ui/react";
import PieceDetail from './components/PieceDetail';
import { Chessboard } from "react-chessboard";
import { useChessGame, parsePieceReferences } from './hooks/useChessGame';
import { PIECE_PERSONALITIES } from './constants/piecePersonalities';
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
  const [selectedPieces, setSelectedPieces] = useState([]);
  const [expandedPiece, setExpandedPiece] = useState(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const [errorMessage, setErrorMessage] = useState('');

  const handleMessageSubmit = async () => {
    if (currentMessage.trim() === '') return;
    
    const messageToSend = currentMessage;
    setErrorMessage(''); // Clear any previous error message
    
    const { invalidReferences } = parsePieceReferences(messageToSend, fen);
    
    if (invalidReferences.length > 0) {
      const invalidPieces = invalidReferences.map(ref => 
        `${ref.expectedType} at ${ref.square}`
      ).join(', ');
      setErrorMessage(`Invalid piece references: ${invalidPieces}`);
      return;
    }
    
    setCurrentMessage(''); // Only clear input if there are no invalid references
    setHighlightedSquares({}); // Clear highlighted squares
    setSelectedPieces([]); // Clear selected pieces
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
        setSelectedPieces(prev => prev.filter(p => p.square !== square));
      } else {
        // Add new reference
        const newMessage = `${currentMessage}${reference} `;
        setCurrentMessage(newMessage);
        updateHighlightedSquares(newMessage);
        setSelectedPieces(prev => [...prev, {
          ...piece,
          square,
          personality: PIECE_PERSONALITIES[pieceSymbol]
        }]);
      }
    } else {
      setSelectedPieces([]);
    }
  };

  return (
    <ChakraProvider>
      <Box p={4} maxW="1200px" mx="auto">
        <VStack spacing={1} mb={4}>
          <Text fontSize="2xl" fontWeight="bold" textAlign="center">Rizz Chess</Text>
          <Text fontSize="md" color="gray.500">
            Inspired by{" "}
            <a 
              href="https://youtu.be/PSesxoY4UFc?feature=shared&t=176" 
              target="_blank" 
              rel="noopener noreferrer" 
              style={{textDecoration: "underline"}}
            >
              NGNL
            </a>
          </Text>
        </VStack>
        <HStack spacing={8} align="flex-start">
          <VStack flex="1" maxW="33%">
            <Box width="100%" aspectRatio="1">
              <Chessboard 
                position={fen} 
                boardOrientation="white"
                onSquareClick={handleSquareClick}
                customSquareStyles={highlightedSquares}
              />
            </Box>
            <Text fontSize="lg">
              {gameOver ? "Game Over!" : "Chat with the pieces"}
            </Text>
            {expandedPiece && (
              <Box mt={4} p={4} bg="gray.50" borderRadius="md" width="100%">
                <Text fontSize="md" fontWeight="bold">
                  {expandedPiece.type.toUpperCase()} at {expandedPiece.square}
                </Text>
                <Text fontSize="sm" mt={2}>
                  {expandedPiece.personality.personality}
                </Text>
                <Text fontSize="sm" color="gray.600" mt={1}>
                  "{expandedPiece.personality.catchphrase}"
                </Text>
                <Text fontSize="sm" color="gray.500" mt={1}>
                  Risk Tolerance: {expandedPiece.personality.riskTolerance}
                </Text>
              </Box>
            )}
          </VStack>
          
          <VStack flex="2" bg="gray.100" p={4} borderRadius="md" alignItems="stretch" height="600px">
            <Text fontSize="xl" fontWeight="bold" mb={4}>Chat</Text>
            <Box ref={chatContainerRef} flex="1" overflowY="auto" mb={4} bg="white" p={2} borderRadius="md">
              {chatMessages.map((msg, index) => (
                <Text 
                  key={index} 
                  className={`chat-message ${msg.sender === "Player" || msg.sender === "AI Opponent" ? "player" : "other"}`}
                >
                  <strong>{msg.sender}: </strong>{msg.message}
                </Text>
              ))}
            </Box>
            <VStack spacing={2} width="100%">
              <HStack width="100%">
                <Input
                  minW="200px"
                  value={currentMessage}
                  onChange={(e) => {
                    setCurrentMessage(e.target.value);
                    updateHighlightedSquares(e.target.value);
                    setErrorMessage(''); // Clear error when input changes
                    
                    // Update selected pieces based on current references
                    const game = new Chess(fen);
                    const { references } = parsePieceReferences(e.target.value, fen);
                    const newSelectedPieces = references.map(ref => {
                      const piece = game.get(ref.square);
                      return {
                        ...piece,
                        square: ref.square,
                        personality: PIECE_PERSONALITIES[piece.type.toUpperCase()]
                      };
                    });
                    setSelectedPieces(newSelectedPieces);
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
              {errorMessage && (
                <Text color="red.500" fontSize="sm" width="100%">
                  {errorMessage}
                </Text>
              )}
            </VStack>
            <Box maxH="200px" overflowY="auto">
              {selectedPieces.map((piece) => (
                <PieceDetail 
                  key={piece.square} 
                  piece={piece} 
                  onClick={() => setExpandedPiece(expandedPiece?.square === piece.square ? null : piece)}
                />
              ))}
            </Box>
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
            <Button colorScheme="blue" mr={3} onClick={() => {
              resetGame();
              onClose();
            }}>
              Play Again
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </ChakraProvider>
  );
};

export default ChessGame;
