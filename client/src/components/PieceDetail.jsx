import React from 'react';
import { Box, Text, Card, CardBody, VStack } from "@chakra-ui/react";

const PieceDetail = ({ piece, onClick }) => {
  return (
    <Card 
      width="100%" 
      mb={2} 
      size="sm" 
      cursor="pointer" 
      onClick={onClick}
      _hover={{ bg: "gray.50" }}
    >
      <CardBody py={2}>
        <Text fontSize="sm" noOfLines={1}>
          {piece.type.toUpperCase()} at {piece.square}: {piece.personality.personality}
        </Text>
      </CardBody>
    </Card>
  );
};

export default PieceDetail;
