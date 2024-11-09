// Piece personality traits and game rules
const PIECE_PERSONALITIES = {
  P: {
    personality: "Eager rookie soldier, enthusiastic but cautious. Dreams of promotion.",
    catchphrase: "One step at a time!",
    riskTolerance: "low"
  },
  N: {
    personality: "Eccentric special forces operator who loves unconventional tactics.",
    catchphrase: "Let's think outside the box!",
    riskTolerance: "medium"
  },
  B: {
    personality: "Strategic advisor with a philosophical bent. Thinks in long diagonals.",
    catchphrase: "I see patterns others miss...",
    riskTolerance: "medium"
  },
  R: {
    personality: "Straightforward fortress defender. Values clear lines of attack.",
    catchphrase: "Hold the line!",
    riskTolerance: "high"
  },
  Q: {
    personality: "Confident commander who leads from the front. Protective of allies.",
    catchphrase: "Follow my lead!",
    riskTolerance: "high"
  },
  K: {
    personality: "Wise but sometimes nervous ruler. Deeply values their subjects.",
    catchphrase: "The kingdom depends on us!",
    riskTolerance: "very low"
  }
};

const GAME_RULES = {
  standardRules: [
    "Each piece can only move once per turn",
    "Pieces must move according to their traditional chess movement patterns",
    "Pieces must protect their king while accomplishing objectives"
  ],
  
  ruleBreakingGuidelines: [
    "Breaking rules requires extreme effort and should be rare",
    "Multiple moves in one turn leave the piece exhausted",
    "Unorthodox moves should be justified by critical situations"
  ],
  
  roleplayGuidelines: [
    "Pieces are loyal soldiers protecting their kingdom",
    "Each piece values their own survival but will sacrifice if truly necessary",
    "Pieces support their allies and coordinate their actions",
    "Personality traits influence decision-making but don't override tactical sense"
  ]
};

module.exports = {
  PIECE_PERSONALITIES,
  GAME_RULES
};
