/* ==========================================================================
   REAL-TIME LIVE AUCTION CLIENT APPLICATION
   ========================================================================== */

// Initialize Socket.io Connection
const socket = io();

// State Variables
let currentAuctionId = 'AUC_VINTAGE_99';
let username = `Vikram_${Math.floor(100 + Math.random() * 900)}`;
let soundEnabled = true;
let currentMinIncrement = 2000;
let currentBidAmount = 50000;
let audioCtx = null;

// DOM Elements
const roomSelect = document.getElementById('roomSelect');
const usernameInput = document.getElementById('usernameInput');
const updateHandleBtn = document.getElementById('updateHandleBtn');
const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundIcon = document.getElementById('soundIcon');
const liveViewerCount = document.getElementById('liveViewerCount');

// Item Elements
const itemCategory = document.getElementById('itemCategory');
const itemStatus = document.getElementById('itemStatus');
const itemImage = document.getElementById('itemImage');
const itemTitle = document.getElementById('itemTitle');
const itemDescription = document.getElementById('itemDescription');
const startingPriceEl = document.getElementById('startingPrice');
const minIncrementEl = document.getElementById('minIncrement');
const auctionIdDisplay = document.getElementById('auctionIdDisplay');

// Timer & Console Elements
const timerClock = document.getElementById('timerClock');
const timerProgress = document.getElementById('timerProgress');
const currentBidTicker = document.getElementById('currentBidTicker');
const highestBidderTag = document.getElementById('highestBidderTag');
const highestBidderName = document.getElementById('highestBidderName');
const bidErrorMessage = document.getElementById('bidErrorMessage');
const bidErrorBox = document.getElementById('bidErrorBox');
const bidAmountInput = document.getElementById('bidAmountInput');
const placeBidBtn = document.getElementById('placeBidBtn');
const biddingControls = document.getElementById('biddingControls');
const auctionSoldCard = document.getElementById('auctionSoldCard');
const soldWording = document.getElementById('soldWording');

// Banners & Log
const outbidAlert = document.getElementById('outbidAlert');
const outbidMessage = document.getElementById('outbidMessage');
const snipeAlert = document.getElementById('snipeAlert');
const snipeMessage = document.getElementById('snipeMessage');
const bidHistoryBody = document.getElementById('bidHistoryBody');
const bidCountBadge = document.getElementById('bidCountBadge');
const roomEventsList = document.getElementById('roomEventsList');
const quickButtons = document.querySelectorAll('.btn-quick');

// Set initial input username
usernameInput.value = username;

// Initialize Web Audio API
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/* ==========================================================================
   WEB AUDIO SYNTHESIZER (ZERO DEPENDENCY AUDIO CUES)
   ========================================================================== */

function playOutbidSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('Audio playback error', e);
  }
}

function playBidSuccessSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 784.00]; // C5, E5, G5 major triad

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.2, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.25);
    });
  } catch (e) {
    console.warn('Audio playback error', e);
  }
}

function playSnipeExtendedSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {
    console.warn('Audio playback error', e);
  }
}

function playAuctionSoldSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.5);

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.warn('Audio playback error', e);
  }
}

/* ==========================================================================
   UTILITY & UI HELPERS
   ========================================================================== */

function formatCurrency(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

function formatTime(seconds) {
  const secs = Math.max(0, seconds);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function logRoomEvent(text, type = 'system') {
  const item = document.createElement('div');
  item.className = `event-item ${type}`;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  item.innerHTML = `[${time}] ${text}`;
  roomEventsList.prepend(item);
}

function dismissOutbidAlert() {
  outbidAlert.classList.add('hidden');
}

function suggestNextBid(currentBid, minIncrement) {
  const nextMin = currentBid + minIncrement;
  bidAmountInput.value = nextMin;
}

/* ==========================================================================
   SOCKET EVENT LISTENERS
   ========================================================================== */

// Join Initial Room
function joinSelectedRoom() {
  currentAuctionId = roomSelect.value;
  username = usernameInput.value.trim() || `Bidder_${socket.id.slice(0, 4)}`;

  // Dismiss any existing alerts
  outbidAlert.classList.add('hidden');
  snipeAlert.classList.add('hidden');
  bidErrorBox.classList.add('hidden');

  // Emit Join Room Event
  socket.emit('auction:join', {
    auctionId: currentAuctionId,
    username: username
  });

  logRoomEvent(`Joining auction room ${currentAuctionId} as ${username}...`, 'system');
}

// 1. Hydrate Initial Room State (auction:init)
socket.on('auction:init', (data) => {
  const { item, bidHistory, timeRemaining, currentBid, highestBidder, totalViewers } = data;

  // Update item details
  itemCategory.textContent = item.category || 'Featured Item';
  itemTitle.textContent = item.title;
  itemDescription.textContent = item.description;
  itemImage.src = item.imageUrl || itemImage.src;
  startingPriceEl.textContent = formatCurrency(item.startingPrice);
  minIncrementEl.textContent = formatCurrency(item.minIncrement);
  auctionIdDisplay.textContent = item.id;

  currentMinIncrement = item.minIncrement;
  currentBidAmount = currentBid;

  // Update viewers badge
  liveViewerCount.textContent = totalViewers || 1;

  // Update price ticker & leader
  updatePriceTicker(currentBid, highestBidder);

  // Update countdown clock
  updateTimerUI(timeRemaining);

  // Update auction status
  if (item.status === 'sold' || item.status === 'ended') {
    setAuctionConcludedState(highestBidder, currentBid);
  } else {
    setAuctionActiveState();
  }

  // Render Bid History
  renderBidHistory(bidHistory);

  // Suggest next valid bid
  suggestNextBid(currentBid, item.minIncrement);

  logRoomEvent(`Hydrated auction room state for ${item.title}.`, 'system');
});

// 2. Room User Joined Event (user:joined)
socket.on('user:joined', (data) => {
  liveViewerCount.textContent = data.totalViewers || 1;
  logRoomEvent(`${data.username} joined the bidding floor.`, 'join');
});

// 3. Room User Left Event (user:left)
socket.on('user:left', (data) => {
  liveViewerCount.textContent = data.totalViewers || 0;
  if (data.username) {
    logRoomEvent(`${data.username} left the bidding floor.`, 'system');
  }
});

// 4. Server 1-Second Timer Tick (auction:time_tick)
socket.on('auction:time_tick', (data) => {
  if (data.auctionId === currentAuctionId) {
    updateTimerUI(data.timeRemaining);
  }
});

// 5. Bid Success Broadcast (bid:success)
socket.on('bid:success', (data) => {
  if (data.auctionId !== currentAuctionId) return;

  currentBidAmount = data.currentBid;
  updatePriceTicker(data.currentBid, data.highestBidder);
  renderBidHistory(data.bidHistory);
  suggestNextBid(data.currentBid, currentMinIncrement);

  // Hide error box if visible
  bidErrorBox.classList.add('hidden');

  // Trigger sound effect
  playBidSuccessSound();

  logRoomEvent(`NEW TOP BID: ${formatCurrency(data.currentBid)} by ${data.highestBidder}!`, 'bid');
});

// 6. Targeted Outbid Alert (bid:outbid) - STRICTLY PRIVATE TO DISPLACED BIDDER
socket.on('bid:outbid', (data) => {
  outbidMessage.innerHTML = `You have been outbid by <strong>${data.outbidBy}</strong> at <strong>${formatCurrency(data.newBid)}</strong>!`;
  outbidAlert.classList.remove('hidden');

  // Play siren alert sound
  playOutbidSound();

  logRoomEvent(`⚠️ ALERT: You were outbid by ${data.outbidBy}!`, 'snipe');
});

// 7. Bid Rejection Error (bid:rejected)
socket.on('bid:rejected', (data) => {
  bidErrorMessage.textContent = data.reason || 'Invalid bid attempt';
  bidErrorBox.classList.remove('hidden');

  // Shake input
  bidAmountInput.classList.add('shake');
  setTimeout(() => bidAmountInput.classList.remove('shake'), 500);

  logRoomEvent(`Rejected: ${data.reason}`, 'system');
});

// 8. Anti-Snipe Extension Event (auction:extended)
socket.on('auction:extended', (data) => {
  snipeMessage.textContent = data.message || 'Anti-snipe triggered: +20s added!';
  snipeAlert.classList.remove('hidden');

  playSnipeExtendedSound();

  // Auto-hide alert after 4s
  setTimeout(() => {
    snipeAlert.classList.add('hidden');
  }, 4000);

  logRoomEvent(`⚡ ANTI-SNIPE EXTENSION: Clock reset to ${data.timeRemaining}s!`, 'snipe');
});

// 9. Auction Sold / Concluded Event (auction:sold)
socket.on('auction:sold', (data) => {
  if (data.auctionId !== currentAuctionId) return;

  setAuctionConcludedState(data.winner, data.finalPrice);
  playAuctionSoldSound();

  logRoomEvent(`🏆 ${data.message}`, 'bid');
});

/* ==========================================================================
   UI RENDERING LOGIC
   ========================================================================== */

function updatePriceTicker(price, leader) {
  currentBidTicker.textContent = formatCurrency(price);

  // Trigger flash update animation
  currentBidTicker.classList.remove('flash-update');
  void currentBidTicker.offsetWidth; // trigger reflow
  currentBidTicker.classList.add('flash-update');

  if (leader) {
    highestBidderName.textContent = leader;
    if (leader === username) {
      highestBidderTag.style.borderColor = 'var(--primary-accent)';
      highestBidderTag.style.color = 'var(--primary-accent)';
      highestBidderName.textContent = `${leader} (YOU ARE LEADING)`;
    } else {
      highestBidderTag.style.borderColor = 'rgba(255, 215, 0, 0.3)';
      highestBidderTag.style.color = 'var(--gold-color)';
    }
  } else {
    highestBidderName.textContent = 'No Bids Yet';
  }
}

function updateTimerUI(timeRemaining) {
  timerClock.textContent = formatTime(timeRemaining);

  // Maximum benchmark assumption for progress bar (e.g. 60s)
  const percent = Math.min(100, Math.max(0, (timeRemaining / 60) * 100));
  timerProgress.style.width = `${percent}%`;

  if (timeRemaining <= 10 && timeRemaining > 0) {
    timerClock.classList.add('warning');
    timerProgress.classList.add('warning');
  } else {
    timerClock.classList.remove('warning');
    timerProgress.classList.remove('warning');
  }
}

function renderBidHistory(history) {
  if (!history || history.length === 0) {
    bidHistoryBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="3">No bids recorded yet. Be the first to bid!</td>
      </tr>
    `;
    bidCountBadge.textContent = '0 Bids';
    return;
  }

  bidCountBadge.textContent = `${history.length} Bids`;

  bidHistoryBody.innerHTML = history.map((bid, index) => {
    const isTop = index === 0;
    const isUser = bid.bidder === username;
    return `
      <tr class="${isTop ? 'top-bid-row' : ''}">
        <td>${bid.timestamp || 'Just now'}</td>
        <td>
          <strong>${bid.bidder}</strong>
          ${isUser ? ' <span style="color:var(--primary-accent);">(You)</span>' : ''}
          ${isTop ? ' 👑' : ''}
        </td>
        <td>${formatCurrency(bid.amount)}</td>
      </tr>
    `;
  }).join('');
}

function setAuctionActiveState() {
  itemStatus.textContent = 'LIVE BIDDING';
  itemStatus.className = 'badge status-badge active-status';
  biddingControls.classList.remove('hidden');
  auctionSoldCard.classList.add('hidden');
  placeBidBtn.disabled = false;
  bidAmountInput.disabled = false;
}

function setAuctionConcludedState(winner, finalPrice) {
  itemStatus.textContent = 'AUCTION SOLD';
  itemStatus.className = 'badge status-badge sold';
  biddingControls.classList.add('hidden');
  auctionSoldCard.classList.remove('hidden');
  placeBidBtn.disabled = true;
  bidAmountInput.disabled = true;

  if (winner && winner !== 'No Bids') {
    soldWording.innerHTML = `Winner: <strong>${winner}</strong> for <strong>${formatCurrency(finalPrice)}</strong>!`;
  } else {
    soldWording.innerHTML = `Auction concluded with no valid bids.`;
  }
}

/* ==========================================================================
   EVENT LISTENERS & BINDINGS
   ========================================================================== */

// Place Bid Handler
function submitBid() {
  const amount = Number(bidAmountInput.value);

  if (!amount || isNaN(amount) || amount <= 0) {
    bidErrorMessage.textContent = 'Please enter a valid bid amount';
    bidErrorBox.classList.remove('hidden');
    return;
  }

  // Hide outbid banner if active
  outbidAlert.classList.add('hidden');

  socket.emit('bid:place', {
    auctionId: currentAuctionId,
    amount: amount,
    username: username
  });
}

placeBidBtn.addEventListener('click', submitBid);

bidAmountInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    submitBid();
  }
});

// Quick Increment Buttons
quickButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const increment = Number(btn.getAttribute('data-add'));
    const nextAmount = currentBidAmount + increment;
    bidAmountInput.value = nextAmount;
  });
});

// Room Selection Change
roomSelect.addEventListener('change', joinSelectedRoom);

// Username Handle Change
updateHandleBtn.addEventListener('click', () => {
  username = usernameInput.value.trim() || username;
  joinSelectedRoom();
});

// Sound FX Toggle Button
soundToggleBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    soundIcon.className = 'fa-solid fa-volume-high';
    soundToggleBtn.style.color = 'var(--primary-accent)';
  } else {
    soundIcon.className = 'fa-solid fa-volume-xmark';
    soundToggleBtn.style.color = 'var(--danger-color)';
  }
});

// Connect Event
socket.on('connect', () => {
  console.log('[Socket Connected]: Socket ID =', socket.id);
  joinSelectedRoom();
});
