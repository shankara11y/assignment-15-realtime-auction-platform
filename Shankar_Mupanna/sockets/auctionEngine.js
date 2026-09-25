const { v4: uuidv4 } = require('uuid');

// In-Memory Auction Room State
const auctions = {
  "AUC_VINTAGE_99": {
    id: "AUC_VINTAGE_99",
    title: "1967 Vintage Fender Stratocaster",
    description: "Original condition rare electric guitar with original sunburst finish and vintage hardshell case.",
    category: "Guitars & Vintage Instruments",
    imageUrl: "https://images.unsplash.com/photo-1550985616-10810253b84d?auto=format&fit=crop&w=800&q=80",
    startingPrice: 50000,
    currentBid: 50000,
    highestBidder: null, // { socketId, username }
    minIncrement: 2000,
    timeRemainingSeconds: 60,
    status: "active", // "upcoming", "active", "ended", "sold"
    bidHistory: []
  },
  "AUC_SUPER_CAR_01": {
    id: "AUC_SUPER_CAR_01",
    title: "1989 Porsche 911 Speedster",
    description: "Low-mileage iconic sports car in Guards Red with original interior and matching numbers.",
    category: "Classic Automobiles",
    imageUrl: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=800&q=80",
    startingPrice: 2500000,
    currentBid: 2500000,
    highestBidder: null,
    minIncrement: 50000,
    timeRemainingSeconds: 90,
    status: "active",
    bidHistory: []
  },
  "AUC_WATCH_42": {
    id: "AUC_WATCH_42",
    title: "Rolex Daytona 'Paul Newman' Ref. 6239",
    description: "Exceedingly rare vintage stainless steel chronograph with exotic dial.",
    category: "Horology & Fine Watches",
    imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
    startingPrice: 1200000,
    currentBid: 1200000,
    highestBidder: null,
    minIncrement: 25000,
    timeRemainingSeconds: 120,
    status: "active",
    bidHistory: []
  }
};

/**
 * Sanitize auction object for public client payload (strip internal references if any)
 */
function sanitizeAuction(auction) {
  return {
    id: auction.id,
    title: auction.title,
    description: auction.description,
    category: auction.category,
    imageUrl: auction.imageUrl,
    startingPrice: auction.startingPrice,
    currentBid: auction.currentBid,
    highestBidder: auction.highestBidder ? auction.highestBidder.username : null,
    minIncrement: auction.minIncrement,
    timeRemainingSeconds: auction.timeRemainingSeconds,
    status: auction.status,
    bidHistory: auction.bidHistory
  };
}

/**
 * Handle user joining an auction room
 */
function handleJoinAuction(io, socket, payload) {
  const { auctionId, username } = payload || {};
  
  if (!auctionId || !auctions[auctionId]) {
    return socket.emit('auction:error', { message: 'Invalid auction ID' });
  }

  const auction = auctions[auctionId];

  // Store user info on socket data
  socket.data.username = username || `Bidder_${socket.id.slice(0, 4)}`;
  socket.data.auctionId = auctionId;

  // Join Socket.io room
  socket.join(auctionId);

  // Get total viewers in room
  const room = io.sockets.adapter.rooms.get(auctionId);
  const totalViewers = room ? room.size : 1;

  // Hydrate initial auction state for newly joined bidder
  socket.emit('auction:init', {
    item: sanitizeAuction(auction),
    bidHistory: auction.bidHistory,
    timeRemaining: auction.timeRemainingSeconds,
    currentBid: auction.currentBid,
    highestBidder: auction.highestBidder ? auction.highestBidder.username : null,
    totalViewers
  });

  // Broadcast user joined update to the room
  io.to(auctionId).emit('user:joined', {
    username: socket.data.username,
    totalViewers
  });
}

/**
 * Authoritative Bid Placement & Anti-Snipe Engine
 */
function handleBidPlacement(io, socket, payload) {
  const auctionId = payload.auctionId || socket.data.auctionId;
  const bidAmount = Number(payload.amount);
  const username = payload.username || socket.data.username || `Bidder_${socket.id.slice(0, 4)}`;

  if (!auctionId || !auctions[auctionId]) {
    return socket.emit('bid:rejected', { reason: 'Auction does not exist' });
  }

  const auction = auctions[auctionId];

  // 1. Check if auction is active and timer has time remaining
  if (auction.status !== 'active' || auction.timeRemainingSeconds <= 0) {
    return socket.emit('bid:rejected', { reason: 'Auction is closed' });
  }

  // 2. Check if bidder is already the highest bidder
  if (auction.highestBidder && auction.highestBidder.socketId === socket.id) {
    return socket.emit('bid:rejected', { reason: 'You are already the highest bidder' });
  }

  // 3. Check minimum increment requirement
  const minimumRequired = auction.currentBid + auction.minIncrement;
  if (isNaN(bidAmount) || bidAmount < minimumRequired) {
    return socket.emit('bid:rejected', {
      reason: `Bid too low. Minimum valid bid is ₹${minimumRequired.toLocaleString('en-IN')}`
    });
  }

  // 4. Capture previous highest bidder to notify outbid privately
  const previousBidder = auction.highestBidder;

  // 5. Update State
  auction.currentBid = bidAmount;
  auction.highestBidder = { socketId: socket.id, username };

  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  const bidEntry = {
    id: uuidv4(),
    bidder: username,
    amount: bidAmount,
    timestamp
  };

  auction.bidHistory.unshift(bidEntry);

  // 6. Anti-Snipe Rule: If bid placed within last 15s, extend timer to 20s
  let extended = false;
  if (auction.timeRemainingSeconds < 15) {
    auction.timeRemainingSeconds = 20;
    extended = true;
    io.to(auction.id).emit('auction:extended', {
      timeRemaining: 20,
      message: 'Anti-snipe triggered: +20 seconds added!'
    });
  }

  // 7. Broadcast new top bid to room
  io.to(auction.id).emit('bid:success', {
    auctionId: auction.id,
    newBid: auction.currentBid,
    currentBid: auction.currentBid,
    highestBidder: username,
    bidHistory: auction.bidHistory,
    timeRemaining: auction.timeRemainingSeconds,
    extended
  });

  // 8. Send private targeted alert strictly to the previous highest bidder
  if (previousBidder && previousBidder.socketId !== socket.id) {
    io.to(previousBidder.socketId).emit('bid:outbid', {
      auctionId: auction.id,
      newBid: bidAmount,
      outbidBy: username,
      message: `You have been outbid by ${username} at ₹${bidAmount.toLocaleString('en-IN')}!`
    });
  }
}

/**
 * Handle socket disconnection
 */
function handleDisconnect(io, socket) {
  const auctionId = socket.data.auctionId;
  if (auctionId && auctions[auctionId]) {
    const room = io.sockets.adapter.rooms.get(auctionId);
    const totalViewers = room ? room.size : 0;
    
    io.to(auctionId).emit('user:left', {
      username: socket.data.username,
      totalViewers
    });
  }
}

module.exports = {
  auctions,
  sanitizeAuction,
  handleJoinAuction,
  handleBidPlacement,
  handleDisconnect
};
