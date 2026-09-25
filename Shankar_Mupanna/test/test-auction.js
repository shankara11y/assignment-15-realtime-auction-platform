const io = require('socket.io-client');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const {
  auctions,
  handleJoinAuction,
  handleBidPlacement,
  handleDisconnect
} = require('../sockets/auctionEngine');

const { startAuctionTimers } = require('../sockets/timerManager');

async function runTests() {
  console.log('\n🧪 Starting Real-Time Auction & Bidding Engine Test Suite...\n');

  // Setup test server
  const app = express();
  const server = http.createServer(app);
  const ioServer = new Server(server, {
    cors: { origin: '*' }
  });

  const timerInterval = startAuctionTimers(ioServer, auctions);

  ioServer.on('connection', (socket) => {
    socket.on('auction:join', (payload) => handleJoinAuction(ioServer, socket, payload));
    socket.on('bid:place', (payload) => handleBidPlacement(ioServer, socket, payload));
    socket.on('disconnect', () => handleDisconnect(ioServer, socket));
  });

  const PORT = 5099;
  await new Promise((resolve) => server.listen(PORT, resolve));
  const SERVER_URL = `http://localhost:${PORT}`;
  console.log(`[Test Server]: Listening on ${SERVER_URL}`);

  let clientA, clientB, clientC;
  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASSED: ${message}`);
      testPassed++;
    } else {
      console.error(`  ❌ FAILED: ${message}`);
      testFailed++;
    }
  }

  try {
    const createClient = () => {
      return new Promise((resolve) => {
        const client = io(SERVER_URL, { forceNew: true, reconnection: false });
        if (client.connected) {
          resolve(client);
        } else {
          client.on('connect', () => resolve(client));
          client.on('connect_error', (err) => {
            console.error('[Client Connect Error]:', err.message);
            resolve(client);
          });
        }
      });
    };

    // -------------------------------------------------------------
    // Test 1: Connect 3 clients & Join Auction Floor Room
    // -------------------------------------------------------------
    console.log('--- Test Group 1: Room Joining & State Hydration ---');

    clientA = await createClient();
    clientB = await createClient();
    clientC = await createClient();

    let clientAHydrated = false;
    clientA.on('auction:init', (data) => {
      if (data.item && data.item.id === 'AUC_VINTAGE_99') {
        clientAHydrated = true;
      }
    });

    clientA.emit('auction:join', { auctionId: 'AUC_VINTAGE_99', username: 'Vikram' });
    clientB.emit('auction:join', { auctionId: 'AUC_VINTAGE_99', username: 'Ananya' });
    clientC.emit('auction:join', { auctionId: 'AUC_VINTAGE_99', username: 'Observer' });

    await new Promise((resolve) => setTimeout(resolve, 300));
    assert(clientAHydrated, 'Client A received hydrated auction state payload (auction:init)');

    // -------------------------------------------------------------
    // Test 2: Valid Bid Placement by Vikram
    // -------------------------------------------------------------
    console.log('\n--- Test Group 2: Valid Bid Placement & Broadcast ---');

    let bidSuccessCount = 0;
    let latestBidData = null;

    const onBidSuccess = (data) => {
      bidSuccessCount++;
      latestBidData = data;
    };

    clientA.on('bid:success', onBidSuccess);
    clientB.on('bid:success', onBidSuccess);
    clientC.on('bid:success', onBidSuccess);

    clientA.emit('bid:place', { auctionId: 'AUC_VINTAGE_99', amount: 52000, username: 'Vikram' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(bidSuccessCount === 3, 'bid:success broadcasted to all 3 connected clients');
    assert(latestBidData && latestBidData.newBid === 52000, 'Current bid updated to ₹52,000');
    assert(latestBidData && latestBidData.highestBidder === 'Vikram', 'Highest bidder recorded as Vikram');

    // -------------------------------------------------------------
    // Test 3: Targeted Private Outbid Notification
    // -------------------------------------------------------------
    console.log('\n--- Test Group 3: Targeted Private Outbid Notification ---');

    let clientAOutbidReceived = false;
    let clientBOutbidReceived = false;
    let clientCOutbidReceived = false;
    let outbidPayload = null;

    clientA.on('bid:outbid', (data) => {
      clientAOutbidReceived = true;
      outbidPayload = data;
    });
    clientB.on('bid:outbid', () => { clientBOutbidReceived = true; });
    clientC.on('bid:outbid', () => { clientCOutbidReceived = true; });

    // Ananya outbids Vikram at ₹54,000
    clientB.emit('bid:place', { auctionId: 'AUC_VINTAGE_99', amount: 54000, username: 'Ananya' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(clientAOutbidReceived, 'Targeted bid:outbid received strictly by displaced bidder (Vikram)');
    assert(!clientBOutbidReceived && !clientCOutbidReceived, 'bid:outbid NOT leaked to new bidder or observers');
    assert(outbidPayload && outbidPayload.outbidBy === 'Ananya' && outbidPayload.newBid === 54000, 'Outbid payload contains correct outbidBy handle and new bid amount');

    // -------------------------------------------------------------
    // Test 4: Authoritative Validation Rejections
    // -------------------------------------------------------------
    console.log('\n--- Test Group 4: Authoritative Validation & Rejections ---');

    let selfOutbidRejected = false;
    clientB.on('bid:rejected', (data) => {
      if (data.reason && data.reason.includes('already the highest bidder')) {
        selfOutbidRejected = true;
      }
    });

    // Ananya tries to bid again while already leading
    clientB.emit('bid:place', { auctionId: 'AUC_VINTAGE_99', amount: 56000, username: 'Ananya' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(selfOutbidRejected, 'Prevented self-outbidding when client is already highest bidder');

    let lowBidRejected = false;
    clientA.on('bid:rejected', (data) => {
      if (data.reason && data.reason.includes('Minimum valid bid')) {
        lowBidRejected = true;
      }
    });

    // Vikram tries to bid below minimum required increment (current is 54,000 + minIncrement 2,000 = 56,000 required)
    clientA.emit('bid:place', { auctionId: 'AUC_VINTAGE_99', amount: 55000, username: 'Vikram' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(lowBidRejected, 'Rejected bid below minimum required increment');

    // -------------------------------------------------------------
    // Test 5: Anti-Snipe Timer Extension
    // -------------------------------------------------------------
    console.log('\n--- Test Group 5: Anti-Snipe Timer Extension ---');

    let antiSnipeTriggered = false;
    const onExtended = (data) => {
      if (data.timeRemaining === 20) {
        antiSnipeTriggered = true;
      }
    };

    clientA.on('auction:extended', onExtended);
    clientB.on('auction:extended', onExtended);

    // Manually lower timer to 10 seconds to simulate final-seconds scenario
    auctions['AUC_VINTAGE_99'].timeRemainingSeconds = 10;

    // Vikram places valid bid in final seconds
    clientA.emit('bid:place', { auctionId: 'AUC_VINTAGE_99', amount: 56000, username: 'Vikram' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(antiSnipeTriggered, 'Anti-snipe triggered: clock reset to 20s when bid placed < 15s');
    assert(auctions['AUC_VINTAGE_99'].timeRemainingSeconds === 20, 'Server-side timeRemainingSeconds set to 20');

    // -------------------------------------------------------------
    // Test 6: Auction Sold & Expiration Lock
    // -------------------------------------------------------------
    console.log('\n--- Test Group 6: Auction Expiration & Sold Status ---');

    let auctionSoldEvent = null;
    clientA.on('auction:sold', (data) => {
      auctionSoldEvent = data;
    });

    // Manually force timer to 1 second and wait for server tick to close it
    auctions['AUC_VINTAGE_99'].timeRemainingSeconds = 1;
    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert(auctionSoldEvent !== null, 'auction:sold event emitted when timer reached 0');
    assert(auctionSoldEvent && auctionSoldEvent.winner === 'Vikram', 'Auction winner correctly identified as Vikram');
    assert(auctionSoldEvent && auctionSoldEvent.finalPrice === 56000, 'Final price correctly identified as ₹56,000');
    assert(auctions['AUC_VINTAGE_99'].status === 'sold', 'Auction room state status updated to "sold"');

    // Attempt bid on closed auction
    let closedBidRejected = false;
    clientB.on('bid:rejected', (data) => {
      if (data.reason && data.reason.includes('closed')) {
        closedBidRejected = true;
      }
    });

    clientB.emit('bid:place', { auctionId: 'AUC_VINTAGE_99', amount: 60000, username: 'Ananya' });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert(closedBidRejected, 'Subsequent bids on closed/sold auction rejected');

  } catch (err) {
    console.error('Unhandled test error:', err);
  } finally {
    clearInterval(timerInterval);
    if (clientA) clientA.disconnect();
    if (clientB) clientB.disconnect();
    if (clientC) clientC.disconnect();
    ioServer.close();
    server.close();

    console.log(`\n======================================================`);
    console.log(`📊 TEST RESULTS: ${testPassed} Passed, ${testFailed} Failed`);
    console.log(`======================================================\n`);

    if (testFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
