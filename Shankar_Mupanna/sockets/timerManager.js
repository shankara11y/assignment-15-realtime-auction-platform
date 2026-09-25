/**
 * Server-Side Countdown Timer & Synchronizer
 * Manages 1-second interval ticking for active auctions and enforces auction closure.
 */

function startAuctionTimers(io, auctions) {
  const timerInterval = setInterval(() => {
    Object.keys(auctions).forEach((auctionId) => {
      const auction = auctions[auctionId];

      if (auction.status === 'active') {
        auction.timeRemainingSeconds -= 1;

        // Broadcast 1s tick to all connected room clients
        io.to(auctionId).emit('auction:time_tick', {
          auctionId: auction.id,
          timeRemaining: auction.timeRemainingSeconds
        });

        // Trigger Auction Sold / Completion when clock hits 0
        if (auction.timeRemainingSeconds <= 0) {
          auction.timeRemainingSeconds = 0;
          auction.status = 'sold';

          const winner = auction.highestBidder ? auction.highestBidder.username : null;
          const finalPrice = auction.currentBid;

          io.to(auctionId).emit('auction:sold', {
            auctionId: auction.id,
            winner: winner || 'No Bids',
            finalPrice: finalPrice,
            status: 'sold',
            message: winner
              ? `Auction Closed! Item sold to ${winner} for ₹${finalPrice.toLocaleString('en-IN')}!`
              : `Auction Closed with no bids placed.`
          });
        }
      }
    });
  }, 1000);

  return timerInterval;
}

module.exports = {
  startAuctionTimers
};
