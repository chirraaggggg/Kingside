const express = require("express")
const socket = require("socket.io")
const http = require("http")
const path = require("path")
const { Chess } = require("chess.js")
const authenticateToken = require('./middleware/auth')
const pool = require('./db')
const { randomBytes } = require("crypto")

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

const rooms = new Map()

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
app.get('/game/:roomId', (req, res) => {
  res.render("game", { roomId: req.params.roomId })
})
app.get('/leaderboard', async (req, res) => {
  const result = await pool.query(
    'SELECT username, elo FROM users ORDER BY elo DESC LIMIT 10'
  )
  res.render('leaderboard', { players: result.rows })
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

  // CREATE ROOM
  socket.on("createRoom", () => {
    const roomId = randomBytes(4).toString('hex')
    rooms.set(roomId, {
      chess: new Chess(),
      players: { white: null, black: null }
    })
    socket.join(roomId)
    rooms.get(roomId).players.white = { id: socket.id, user: socket.data.user }
    socket.emit("roomCreated", roomId)
    socket.emit("playerRole", "w")
    console.log(`Room created: ${roomId}`)
  })

  // JOIN ROOM
  socket.on("joinRoom", (roomId) => {
    const room = rooms.get(roomId)

    if (!room) {
      socket.emit("roomError", "Room not found")
      return
    }

    if (room.players.white && room.players.black) {
      socket.join(roomId)
      socket.emit("spectatorRole")
      socket.emit("boardState", room.chess.fen())
      return
    }

    socket.join(roomId)
    room.players.black = { id: socket.id, user: socket.data.user }
    socket.emit("playerRole", "b")
    io.to(roomId).emit("boardState", room.chess.fen())
    console.log(`Player joined room: ${roomId}`)
  })

  // MOVE
  socket.on("move", async ({ roomId, move }) => {
    try {
      const room = rooms.get(roomId)
      if (!room) return

      const { chess, players } = room

      if (chess.turn() === "w" && socket.id !== players.white.id) return
      if (chess.turn() === "b" && socket.id !== players.black.id) return

      const result = chess.move(move)
      if (result) {
        socket.to(roomId).emit("move", move)
        io.to(roomId).emit("boardState", chess.fen())

        if (chess.in_checkmate()) {
          const winnerId = result.color === "w" ? players.white.user.id : players.black.user.id
          const loserId  = result.color === "w" ? players.black.user.id : players.white.user.id

          const winnerData = await pool.query('SELECT elo FROM users WHERE id = $1', [winnerId])
          const loserData  = await pool.query('SELECT elo FROM users WHERE id = $1', [loserId])

          const { newWinnerElo, newLoserElo } = calculateElo(
            winnerData.rows[0].elo,
            loserData.rows[0].elo
          )

          await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newWinnerElo, winnerId])
          await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newLoserElo, loserId])

          io.to(roomId).emit("gameOver", {
            reason: "checkmate",
            winner: result.color === "w" ? players.white.user.username : players.black.user.username,
            newRatings: {
              white: { username: players.white.user.username, elo: result.color === "w" ? newWinnerElo : newLoserElo },
              black: { username: players.black.user.username, elo: result.color === "b" ? newWinnerElo : newLoserElo }
            }
          })
          rooms.delete(roomId)

        } else if (chess.in_draw() || chess.in_stalemate()) {
          io.to(roomId).emit("gameOver", { reason: "draw", winner: null })
          rooms.delete(roomId)

        } else if (chess.in_check()) {
          io.to(roomId).emit("check", chess.turn())
        }

      } else {
        socket.emit("invalidMove", move)
      }
    } catch (err) {
      console.log("Move error:", err)
      socket.emit("invalidMove", move)
    }
  })

  // DISCONNECT
  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id)
    rooms.forEach((room, roomId) => {
      if (socket.id === room.players.white?.id) {
        delete room.players.white
        io.to(roomId).emit("playerDisconnected", "white")
        if (!room.players.black) rooms.delete(roomId)
      } else if (socket.id === room.players.black?.id) {
        delete room.players.black
        io.to(roomId).emit("playerDisconnected", "black")
        if (!room.players.white) rooms.delete(roomId)
      }
    })
  })
})

server.listen(3000, () => {
  console.log("listening on port 3000")
})