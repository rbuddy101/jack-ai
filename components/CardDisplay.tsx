/**
 * Card Display Component
 *
 * Displays dealer and player cards during blackjack gameplay.
 */

"use client";

interface CardData {
  rank: string;
  suit: string;
  value: number;
}

interface CardDisplayProps {
  playerCards: CardData[];
  playerTotal: number;
  dealerCards: CardData[];
  dealerTotal: number;
}

export function CardDisplay({
  playerCards,
  playerTotal,
  dealerCards,
  dealerTotal,
}: CardDisplayProps) {
  const getSuitSymbol = (suit: string): string => {
    const suitMap: Record<string, string> = {
      "♠": "♠",
      "♥": "♥",
      "♦": "♦",
      "♣": "♣",
      spades: "♠",
      hearts: "♥",
      diamonds: "♦",
      clubs: "♣",
    };
    return suitMap[suit.toLowerCase()] || suit;
  };

  const getSuitColor = (suit: string): string => {
    const suitLower = suit.toLowerCase();
    if (suitLower === "hearts" || suitLower === "♥" || suitLower === "diamonds" || suitLower === "♦") {
      return "text-red-500";
    }
    return "text-gray-900";
  };

  const renderCard = (card: CardData, index: number) => {
    const suitSymbol = getSuitSymbol(card.suit);
    const suitColor = getSuitColor(card.suit);

    return (
      <div
        key={index}
        className="relative bg-white rounded-lg shadow-lg w-20 h-28 flex flex-col items-center justify-center border-2 border-gray-300"
      >
        <div className={`text-3xl font-bold ${suitColor}`}>{card.rank}</div>
        <div className={`text-2xl ${suitColor}`}>{suitSymbol}</div>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Dealer's Hand */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Dealer</h3>
          <div className="text-xl font-bold text-blue-400">
            Total: {dealerTotal}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {dealerCards.length > 0 ? (
            dealerCards.map((card, index) => renderCard(card, index))
          ) : (
            <div className="text-gray-500">No cards yet</div>
          )}
        </div>
      </div>

      {/* Player's Hand */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">AI Agent</h3>
          <div className="text-xl font-bold text-green-400">
            Total: {playerTotal}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          {playerCards.length > 0 ? (
            playerCards.map((card, index) => renderCard(card, index))
          ) : (
            <div className="text-gray-500">No cards yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
