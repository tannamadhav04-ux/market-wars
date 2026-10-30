# MARKET WARS — Multiplayer Trading Arena

A Node.js + Express + Socket.IO browser game for 2–8 players. The project uses a dark cinematic gaming interface with the supplied Bull-vs-Bear MARKET WARS cover art.

## Features
- Private 6-character room codes
- 2–8 players per room; host-controlled start
- ₹10,00,000 virtual starting cash per player
- 20 simulated Indian equity symbols
- 10 rounds, 3 minutes per round
- Shared server-generated market prices and common round-close settlement
- BUY/SELL orders queued during a round
- Private player cash, holdings, pending orders and transaction history
- Shared leaderboard, room roster and simulated market news
- Responsive desktop and mobile UI
- Health endpoint at `/health`

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:3000` in a browser. For multiplayer testing, open the same deployed/local URL on two different devices on the same reachable network or public host.

## Deploy on Render

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Add no environment variables; Render supplies `PORT`.

## Important notes

- All prices and events are simulated. This is not connected to live NSE prices and does not place real trades.
- Room state is held in server memory. Restarting the server clears active rooms; use a persistent store and multi-instance coordination before production scaling.
- This project package is a rebuilt source baseline. Test the deployed service and two-device gameplay before submitting it to a contest.
