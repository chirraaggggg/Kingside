const express = require("express")
const socket = require("socket.io")
const http = require("http")
const path = require("path")
const { Chess } = require("chess.js")

const app = express()
const server = http.createServer(app)
const io = socket(server)

const chess = new Chess()

let players = {}
let currentPlayer = "w"

app.set("view engine", "ejs")
app.use(express.static(path.join(__dirname, "public")))

app.get("/", (req, res) => {
    res.render("index", { title: "Chess Game" })
})

io.on("connection", (socket) => {
    console.log("a user connected")

    if (!players.white) {
        players.white = socket.id
        socket.emit("playerRole", "w")
    } else if (!players.black) {
        players.black = socket.id
        socket.emit("playerRole", "b")
    } else {
        socket.emit("spectator")
    }

    socket.on("disconnect", () => {
        if (socket.id === players.white) {
            delete players.white
        } else if (socket.id === players.black) {
            delete players.black
        } else {
            // spectator disconnected
        }
    })

    socket.on("move", (move) => {
        try {
            if (chess.turn() === "w" && socket.id !== players.white) return
            if (chess.turn() === "b" && socket.id !== players.black) return

            const result = chess.move(move)
            if(result) {
                currentPlayer = chess.turn()
                io.emit("move", move)
                io.emit("boardState", chess.fen())
            } else {
                console.log("Invalid move:", move)
                socket.emit("invalidMove", move)
            }
        } catch (err) {
            console.log(err)
            socket.emit("Invalid move:", move)
        }
    })
})
server.listen(3000, () => {
    console.log(`listening on 3000`)
})