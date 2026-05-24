const express = require("express")
const socket = require("socket.io")
const http = require("http")
const path = require("path")
const { Chess } = require("chess.js")
const authenticateToken = require('./middleware/auth')
const pool = require('./db')

const calculateElo = (winnerElo, loserElo) => {
  const K = 32
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))
  const expectedLoser  = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400))
  return {
    newWinnerElo: Math.round(winnerElo + K * (1 - expectedWinner)),
    newLoserElo:  Math.round(loserElo  + K * (0 - expectedLoser))
  }
}

const app = express()
const server = http.createServer(app)
const io = socket(server)

let chess = new Chess()
let players = {}
let currentPlayer = "w"

// middlewares
app.use(express.json())
app.use('/auth', require('./routes/auth'))
app.set("view engine", "ejs")
app.use(express.static(path.join(__dirname, "public")))

// routes
app.get("/", (req, res) => {
  res.render("index", { title: "Chess Game" })
})
app.get('/login', (req, res) => {
  res.render('login')
})
app.get('/register', (req, res) => {
  res.render('register')
})

// socket middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (!token) return next(new Error('No token provided'))
  const user = authenticateToken(token)
  if (!user) return next(new Error('Invalid token'))
  socket.data.user = user
  next()
})

// socket connections
io.on("connection", (socket) => {
  console.log("a user connected:", socket.id, "user:", socket.data.user.username)

  if (!players.white) {
    players.white = { id: socket.id, user: socket.data.user }
    socket.emit("playerRole", "w")
  } else if (!players.black) {
    players.black = { id: socket.id, user: socket.data.user }
    socket.emit("playerRole", "b")
    io.emit("boardState", chess.fen())
  } else {
    socket.emit("spectatorRole")
    socket.emit("boardState", chess.fen())
  }

  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id)
    if (socket.id === players.white?.id) {
      delete players.white
      chess = new Chess()
      io.emit("playerDisconnected", "white")
    } else if (socket.id === players.black?.id) {
      delete players.black
      chess = new Chess()
      io.emit("playerDisconnected", "black")
    }
  })

  socket.on("move", async (move) => {
    try {
      if (chess.turn() === "w" && socket.id !== players.white.id) return
      if (chess.turn() === "b" && socket.id !== players.black.id) return

      const result = chess.move(move)
      if (result) {
        currentPlayer = chess.turn()
        socket.broadcast.emit("move", move)
        io.emit("boardState", chess.fen())

        if (chess.in_checkmate()) {
          const winnerId = result.color === "w" ? players.white.user.id : players.black.user.id
          const loserId  = result.color === "w" ? players.black.user.id : players.white.user.id

          // get both players' current ELO from DB
          const winnerData = await pool.query('SELECT elo FROM users WHERE id = $1', [winnerId])
          const loserData  = await pool.query('SELECT elo FROM users WHERE id = $1', [loserId])

          const winnerElo = winnerData.rows[0].elo
          const loserElo  = loserData.rows[0].elo

          // calculate new ratings
          const { newWinnerElo, newLoserElo } = calculateElo(winnerElo, loserElo)

          // save to DB
          await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newWinnerElo, winnerId])
          await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newLoserElo, loserId])

          io.emit("gameOver", {
            reason: "checkmate",
            winner: result.color === "w" ? players.white.user.username : players.black.user.username,
            newRatings: {
              white: { username: players.white.user.username, elo: result.color === "w" ? newWinnerElo : newLoserElo },
              black: { username: players.black.user.username, elo: result.color === "b" ? newWinnerElo : newLoserElo }
            }
          })

        } else if (chess.in_draw()) {
          io.emit("gameOver", { reason: "draw", winner: null })

        } else if (chess.in_stalemate()) {
          io.emit("gameOver", { reason: "stalemate", winner: null })

        } else if (chess.in_check()) {
          io.emit("check", chess.turn())
        }

      } else {
        socket.emit("invalidMove", move)
      }
    } catch (err) {
      console.log("Move error:", err)
      socket.emit("invalidMove", move)
    }
  })
})
app.get('/leaderboard', async (req, res) => {
  const result = await pool.query('SELECT username, elo FROM users ORDER BY elo DESC LIMIT 10')
  res.render('leaderboard', { players: result.rows })
})
server.listen(3000, () => {
  console.log("listening on port 3000")
})