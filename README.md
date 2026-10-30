# MARKET WARS — Online Multiplayer MVP

## Included
- Node.js + Express + Socket.IO server
- Private six-character room codes; 2–8 players
- Shared server-generated simulated Indian stock prices and news
- ₹10,00,000 virtual starting cash per player
- 3-minute rounds, 10 rounds
- Server-side order validation, duplicate-ID checks, cash/share reservation checks
- Batch settlement at the same round-end price for each symbol
- Private holdings, cash, pending orders and transaction history
- Shared leaderboard and responsive dark trading UI

## Run locally
1. Install Node.js 20 or later.
2. Extract this ZIP.
3. In the project folder run: `npm install`
4. Run: `npm start`
5. Open `http://localhost:3000` in two separate browser windows.
6. Create a room in one window, join using the six-character code in the other.
7. Host starts once both players are in the lobby.

## Host online
Deploy this folder to a Node.js host that supports long-lived WebSocket connections (for example a service configured for Node apps). Set the start command to `npm start` and expose the assigned PORT. Share the HTTPS URL with players.

## Important limitations
- This is an MVP starter, not yet production-hardened.
- Room/player state is in server memory and is lost on server restart.
- Reconnection recovery, persistent database storage, authentication, rate limiting, multi-instance Redis coordination, automated test suite, and production deployment still need implementation.
- Simulated prices/news only; no real market data or real-money trading.
- Host is the room creator; room access currently uses a room code only.
