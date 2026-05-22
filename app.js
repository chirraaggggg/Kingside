const express = require("express");
const socket = require("socket.io");
const http = require("http");
const path = require("path");
const { Chess } = require("chess.js");

const app = express();
const server = http.createServer(app);
const io = socket(server);

// FIX: Create a fresh Chess instance per game, not globally shared across reconnects
let chess = new Chess();
let players = {};
let currentPlayer = "w";

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.render("index", { title: "Chess Game" });
});

io.on("connection", (socket) => {
  console.log("a user connected:", socket.id);

  if (!players.white) {
    players.white = socket.id;
    socket.emit("playerRole", "w");
  } else if (!players.black) {
    players.black = socket.id;
    socket.emit("playerRole", "b");
    // Both players connected - send current board state
    io.emit("boardState", chess.fen());
  } else {
    // FIX: was emitting "spectator" but client listened for "spectatorRole"
    socket.emit("spectatorRole");
    socket.emit("boardState", chess.fen());
  }

  socket.on("disconnect", () => {
    console.log("user disconnected:", socket.id);
    if (socket.id === players.white) {
      delete players.white;
      // FIX: reset game when a player leaves so a new player can join fresh
      chess = new Chess();
      io.emit("playerDisconnected", "white");
    } else if (socket.id === players.black) {
      delete players.black;
      chess = new Chess();
      io.emit("playerDisconnected", "black");
    }
  });

  socket.on("move", (move) => {
    try {
      if (chess.turn() === "w" && socket.id !== players.white) return;
      if (chess.turn() === "b" && socket.id !== players.black) return;

      const result = chess.move(move);
      if (result) {
        currentPlayer = chess.turn();
        // FIX: emit move to everyone EXCEPT the sender (they already applied it locally)
        socket.broadcast.emit("move", move);
        // Send authoritative board state to everyone
        io.emit("boardState", chess.fen());

        // Emit game status events
        if (chess.isCheckmate()) {
          io.emit("gameOver", { reason: "checkmate", winner: result.color === "w" ? "White" : "Black" });
        } else if (chess.isDraw()) {
          io.emit("gameOver", { reason: "draw", winner: null });
        } else if (chess.isCheck()) {
          io.emit("check", chess.turn());
        }
      } else {
        socket.emit("invalidMove", move);
      }
    } catch (err) {
      console.log("Move error:", err);
      socket.emit("invalidMove", move);
    }
  });
});

server.listen(3000, () => {
  console.log("listening on port 3000");
});