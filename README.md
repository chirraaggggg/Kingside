# ♟ Chess Master

A real-time multiplayer chess platform built from scratch with Node.js, Socket.io, PostgreSQL, and JWT authentication.

---

## Screenshots

> _Add your screenshots here_

---

## Features

- **Real-time multiplayer** — two players connect and play live via WebSockets
- **JWT Authentication** — secure register and login with bcrypt password hashing
- **ELO Rating System** — ratings update automatically after every game
- **Leaderboard** — live rankings sorted by ELO
- **Board flip** — board automatically orients to your color
- **Legal move highlighting** — click a piece to see valid moves
- **Click to move + drag and drop** — both interaction styles supported
- **Last move highlight** — always know what your opponent just played
- **Move history** — full algebraic notation move list
- **Check / Checkmate / Draw detection** — server-side game state validation
- **Spectator mode** — watch live games without interfering
- **Disconnect handling** — graceful recovery when a player leaves

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Real-time | Socket.io |
| Database | PostgreSQL |
| Auth | JWT + bcrypt |
| Templating | EJS |
| Chess Logic | chess.js |
| Validation | express-validator |

---

## Architecture

```
Client (Browser)
    │
    ├── HTTP (Express)
    │     ├── POST /auth/register   → validate → hash → save → JWT
    │     ├── POST /auth/login      → validate → compare → JWT
    │     ├── GET  /leaderboard     → query DB → render
    │     └── GET  /                → render chess board
    │
    └── WebSocket (Socket.io)
          ├── io.use()              → verify JWT on every connection
          ├── playerRole            → assign white / black / spectator
          ├── move                  → validate → update board → broadcast
          ├── gameOver              → calculate ELO → update DB → emit
          └── disconnect            → cleanup → reset game
```

---

## Database Schema

```sql
CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  username     VARCHAR(50)  UNIQUE NOT NULL,
  email        VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  elo          INTEGER      DEFAULT 1200,
  created_at   TIMESTAMP    DEFAULT NOW()
);
```

---

## ELO Rating System

Ratings update after every game using the standard ELO formula:

```
Expected score  = 1 / (1 + 10^((opponentElo - playerElo) / 400))
New rating      = currentElo + K * (actualScore - expectedScore)
K factor        = 32
Starting ELO    = 1200
```

**Examples:**
- Equal players (1200 vs 1200) → winner gains 16, loser loses 16
- Underdog (1000) beats favourite (1400) → underdog gains 29
- Favourite (1400) beats underdog (1000) → favourite gains only 3

---

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL 14+

### Installation

```bash
# clone the repo
git clone https://github.com/chirraaggggg/Chess.git
cd Chess

# install dependencies
npm install
```

### Database Setup

```bash
# connect to postgres
psql -U postgres

# create database and table
CREATE DATABASE chess;
\c chess

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  elo INTEGER DEFAULT 1200,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Environment Variables

Create a `.env` file in the root directory:

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=chess
DB_PASSWORD=your_postgres_password
DB_PORT=5432
JWT_SECRET=your_long_random_secret_here
```

### Run

```bash
node app.js
```

Open `http://localhost:3000` in your browser.

---

## How to Play

1. Go to `/register` and create an account
2. Open a second browser window and register a second account
3. Both players visit `/` — first gets White, second gets Black
4. Play chess — board flips automatically for Black
5. ELO updates after checkmate
6. Check the leaderboard at `/leaderboard`

---

## Project Structure

```
Chess/
├── app.js                 # Express server + Socket.io
├── db.js                  # PostgreSQL connection pool
├── middleware/
│   └── auth.js            # JWT verification middleware
├── routes/
│   └── auth.js            # Register + login routes
├── views/
│   ├── index.ejs          # Chess board UI
│   ├── login.ejs          # Login page
│   ├── register.ejs       # Register page
│   └── leaderboard.ejs    # ELO leaderboard
└── public/
    └── js/
        └── main.js        # Client-side chess logic
```

---

## Roadmap

- [ ] Game rooms — multiple concurrent games
- [ ] Game timer — blitz, rapid, classical time controls
- [ ] Game history — store and replay past games
- [ ] Resign and draw offer
- [ ] Play vs Stockfish engine
- [ ] Rate limiting and security hardening
- [ ] Mobile responsive design

---

## Author

**Chirag Sharma**
- GitHub: [@chirraaggggg](https://github.com/chirraaggggg)
- Portfolio: [chirags.dev](https://chirags.dev)

---

## License

MIT