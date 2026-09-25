# Real-Time Live Auction & Bidding Engine (Socket.io)

![Node.js](https://img.shields.io/badge/Node.js-v24.20.0-green?logo=node.js)
![Socket.io](https://img.shields.io/badge/Socket.io-v4.8.1-black?logo=socket.io)
![Express](https://img.shields.io/badge/Express.js-v4.21.2-blue?logo=express)
![License](https://img.shields.io/badge/License-ISC-purple)

A mission-critical, low-latency **Real-Time Live Auction & Bidding Platform** engineered with **Node.js, Express.js, and Socket.io**. Built with an authoritative in-memory bidding engine that prevents race conditions, enforces minimum bid increments, dispatches targeted private outbid notifications, synchronizes server countdown clocks across all connected bidders, and executes Anti-Snipe timer extensions.

---

## 🌟 Key Features

1. **Authoritative In-Memory Transaction Engine**:
   - Validates incoming bids on the server to prevent race conditions.
   - Enforces strict minimum bid increment rules (`bidAmount >= currentBid + minIncrement`).
   - Restricts self-outbidding (bidders cannot outbid themselves when leading).
   - Rejects bids placed on closed or sold auctions.

2. **Server-Side Countdown Timer & Synchronizer**:
   - Centralized 1-second interval timer maintained on the server.
   - Broadcasts `auction:time_tick` events every second to guarantee clock synchronization across all room participants.
   - Enforces auction conclusion (`auction:sold`) when the clock reaches 0.

3. **Anti-Snipe Protection (Soft-Close Timer Extension)**:
   - Automatically extends auction time back to 20 seconds whenever a valid bid is placed in the final 15 seconds (`timeRemainingSeconds < 15`).
   - Emits `auction:extended` to alert all participants in real time.

4. **Targeted Private Outbid Alerts**:
   - Leverages direct socket targeting (`io.to(previousBidder.socketId).emit('bid:outbid', ...)`) to dispatch private outbid alerts strictly to the displaced leading bidder.
   - Triggers Web Audio API siren alerts and visual warning banners on the displaced bidder's screen.

5. **Auditable Bid History Feed & Room Metrics**:
   - Maintains a real-time, chronological transaction ledger of all bids with timestamps and bidder handles.
   - Tracks live audience numbers per room (`user:joined`, `user:left`).

6. **Dark Trading Floor Client UI & Web Audio Cues**:
   - High-contrast dark trading floor aesthetic with glowing price tickers, animated countdown gauges, and audio synthesizer cues (bid success ping, outbid siren, anti-snipe chime, gavel strike sound).

---

## 🏗️ Technical Architecture & Directory Structure

```
assignment-15-auction-socket/
├── public/
│   ├── index.html           # Dark trading floor UI layout & control panels
│   ├── app.js               # Client Socket.io handlers, Web Audio synth & DOM updates
│   └── style.css            # Dark trading floor aesthetic & animations
├── sockets/
│   ├── auctionEngine.js     # Authoritative bid validation, outbid alerts & anti-snipe
│   └── timerManager.js      # Server-side 1s interval countdown synchronizer
├── test/
│   └── test-auction.js      # Automated multi-client Socket.io integration test suite
├── server.js                # Express & Socket.io server setup & REST endpoints
├── package.json
└── README.md
```

---

## 📡 Real-Time Socket Event Protocol

### 🔄 Room & Stream Events
| Event Name | Direction | Payload Schema | Description |
| :--- | :--- | :--- | :--- |
| `auction:join` | Client $\rightarrow$ Server | `{ "auctionId": "AUC_VINTAGE_99", "username": "Vikram" }` | Joins the live bidding room floor |
| `auction:init` | Server $\rightarrow$ Client | `{ "item": { ... }, "bidHistory": [...], "timeRemaining": 60, "currentBid": 50000, "highestBidder": null, "totalViewers": 1 }` | Hydrates current auction status to newly joined bidder |
| `auction:time_tick` | Server $\rightarrow$ Room | `{ "auctionId": "AUC_VINTAGE_99", "timeRemaining": 44 }` | Server countdown tick broadcast every 1s |
| `user:joined` | Server $\rightarrow$ Room | `{ "username": "Vikram", "totalViewers": 14 }` | Updates room audience counter |
| `user:left` | Server $\rightarrow$ Room | `{ "username": "Vikram", "totalViewers": 13 }` | Updates room audience counter on socket disconnect |

### 💰 Live Bidding Actions
| Event Name | Direction | Payload Schema | Description |
| :--- | :--- | :--- | :--- |
| `bid:place` | Client $\rightarrow$ Server | `{ "auctionId": "AUC_VINTAGE_99", "amount": 54000, "username": "Vikram" }` | Client submits a bid attempt |
| `bid:success` | Server $\rightarrow$ Room | `{ "auctionId": "...", "newBid": 54000, "highestBidder": "Vikram", "bidHistory": [...], "timeRemaining": 30 }` | Broadcasts new leading price and bid history |
| `bid:outbid` | Server $\rightarrow$ Client | `{ "message": "You were outbid by Vikram at ₹54,000!", "newBid": 54000, "outbidBy": "Vikram" }` | **Targeted private alert** sent strictly to previous highest bidder |
| `bid:rejected` | Server $\rightarrow$ Client | `{ "reason": "Bid too low. Minimum valid bid is ₹56,000" }` | Rejection error sent privately to invalid bid attempt |
| `auction:extended` | Server $\rightarrow$ Room | `{ "timeRemaining": 20, "message": "Anti-snipe triggered: +20 seconds added!" }` | Emitted when late bid extends the clock |
| `auction:sold` | Server $\rightarrow$ Room | `{ "winner": "Vikram", "finalPrice": 62000, "status": "sold" }` | Emitted when clock hits 0 and item is sold |

---

## 🚀 Quick Start Guide

### 1. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/itm-assignment-15-auction-socket.git
cd assignment-15-auction-socket
npm install
```

### 2. Start Development Server
Run server with `nodemon`:
```bash
npm run dev
```
Or start normal production server:
```bash
npm start
```
The server will start on **`http://localhost:5000`**.

---

## 🧪 Automated Testing

Execute the multi-client socket integration test suite:
```bash
npm test
```
The test suite validates:
- [x] Room joining and state hydration (`auction:init`).
- [x] Valid bid placement and room broadcast (`bid:success`).
- [x] Targeted outbid notification delivered strictly to the displaced bidder socket (`bid:outbid`).
- [x] Prevention of self-outbidding and low bid rejection (`bid:rejected`).
- [x] Anti-snipe time extension trigger (`auction:extended`).
- [x] Server clock expiration and auction sold lock (`auction:sold`).

---

## 🖥️ Manual Verification Walkthrough

1. Open 3 separate browser windows (or Incognito tabs) pointing to `http://localhost:5000`.
2. In Window 1, set handle as **Vikram**. In Window 2, set handle as **Ananya**. In Window 3, observe as **Viewer C**.
3. **Place a Bid from Vikram (₹52,000)**:
   - Observe all 3 windows instantly update current bid ticker to **₹52,000**.
4. **Place a Higher Bid from Ananya (₹54,000)**:
   - Ananya becomes leading bidder.
   - **Vikram's screen immediately pops up a red "OUTBID ALERT" banner** accompanied by a warning audio siren.
   - Window 3 (Viewer C) sees the price update without receiving the outbid banner.
5. **Anti-Snipe Verification**:
   - Wait until the countdown clock drops below 15 seconds (e.g., 8s).
   - Place a valid bid from Vikram.
   - Observe the clock jump back to **00:20** seconds with an **"ANTI-SNIPE TRIGGERED: +20s ADDED!"** alert banner.
6. **Auction Completion**:
   - Let the timer run down to `00:00`.
   - Observe status change to **AUCTION SOLD**, winner banner displayed, and bid inputs disabled.
