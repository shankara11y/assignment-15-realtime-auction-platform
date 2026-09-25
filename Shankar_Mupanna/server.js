const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const {
  auctions,
  sanitizeAuction,
  handleJoinAuction,
  handleBidPlacement,
  handleDisconnect
} = require('./sockets/auctionEngine');

const { startAuctionTimers } = require('./sockets/timerManager');

const app = express();
const server = http.createServer(app);

// Enable CORS
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// REST API Endpoints
app.get('/api/auctions', (req, res) => {
  const list = Object.values(auctions).map(sanitizeAuction);
  res.json({ success: true, auctions: list });
});

app.get('/api/auctions/:id', (req, res) => {
  const auction = auctions[req.params.id];
  if (!auction) {
    return res.status(404).json({ success: false, message: 'Auction not found' });
  }
  res.json({ success: true, auction: sanitizeAuction(auction) });
});

// Initialize Socket.io Server
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Start Server-Side Countdown Clock & Timer Synchronizer
startAuctionTimers(io, auctions);

// Socket Connection Lifecycle
io.on('connection', (socket) => {
  console.log(`[Socket Connected]: ${socket.id}`);

  // 1. Join auction floor room
  socket.on('auction:join', (payload) => {
    handleJoinAuction(io, socket, payload);
  });

  // 2. Authoritative bid placement
  socket.on('bid:place', (payload) => {
    handleBidPlacement(io, socket, payload);
  });

  // 3. Socket disconnection
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected]: ${socket.id}`);
    handleDisconnect(io, socket);
  });
});

// Start HTTP & Socket Server with automatic port fallback if 5000 is occupied
const DEFAULT_PORT = process.env.PORT || 5000;

function startServer(port) {
  server.listen(port, () => {
    console.log(`
  ======================================================
  🔨 LIVE AUCTION & BIDDING ENGINE SERVER RUNNING
  ======================================================
  - Local URL: http://localhost:${port}
  - Environment: ${process.env.NODE_ENV || 'development'}
  - Active Auctions: ${Object.keys(auctions).length}
  ======================================================
  `);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port === 5000) {
      console.log(`[Port Warning]: Port 5000 in use, falling back to http://localhost:5050...`);
      startServer(5050);
    } else {
      console.error('[Server Error]:', err);
    }
  });
}

startServer(DEFAULT_PORT);
