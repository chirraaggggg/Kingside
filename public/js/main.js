// get token and connect with auth
const token = localStorage.getItem('token')
const socket = io({ auth: { token } })

const chess = new Chess()
const boardElement = document.getElementById("chessboard")

let draggedPiece = null
let sourceSquare = null
let playerRole = null
let selectedSquare = null
let possibleMoves = []
let lastMove = null
let moveHistory = []

// ─── Coordinate Helpers ────────────────────────────────────────────────────────
const toAlgebraic = (row, col) => `${String.fromCharCode(97 + col)}${8 - row}`

// ─── Move History Panel ────────────────────────────────────────────────────────
const updateMoveHistory = (san) => {
  moveHistory.push(san)
  const listEl = document.getElementById("move-list")
  if (!listEl) return
  listEl.innerHTML = ""
  for (let i = 0; i < moveHistory.length; i += 2) {
    const entry = document.createElement("div")
    entry.className = "move-entry"
    const num = document.createElement("span")
    num.className = "move-num"
    num.textContent = `${Math.floor(i / 2) + 1}.`
    const wMove = document.createElement("span")
    wMove.className = "move-w"
    wMove.textContent = moveHistory[i] || ""
    const bMove = document.createElement("span")
    bMove.className = "move-b"
    bMove.textContent = moveHistory[i + 1] || ""
    entry.appendChild(num)
    entry.appendChild(wMove)
    entry.appendChild(bMove)
    listEl.appendChild(entry)
  }
  listEl.scrollTop = listEl.scrollHeight
}

// ─── Labels Flip ──────────────────────────────────────────────────────────────
const updateLabels = () => {
  const isFlipped = playerRole === "b"
  const rankLabels = document.getElementById("rank-labels")
  const fileLabels = document.getElementById("file-labels")
  if (rankLabels) {
    const ranks = isFlipped ? ["1","2","3","4","5","6","7","8"] : ["8","7","6","5","4","3","2","1"]
    rankLabels.innerHTML = ranks.map(r => `<span>${r}</span>`).join("")
  }
  if (fileLabels) {
    const files = isFlipped ? ["h","g","f","e","d","c","b","a"] : ["a","b","c","d","e","f","g","h"]
    fileLabels.innerHTML = files.map(f => `<span class="file-label">${f}</span>`).join("")
  }
}

// ─── Render Board ──────────────────────────────────────────────────────────────
const renderBoard = () => {
  const board = chess.board()
  boardElement.innerHTML = ""

  const isFlipped = playerRole === "b"
  const rowOrder = isFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7]
  const colOrder = isFlipped ? [7,6,5,4,3,2,1,0] : [0,1,2,3,4,5,6,7]

  rowOrder.forEach((row) => {
    colOrder.forEach((col) => {
      const square = board[row][col]
      const alg = toAlgebraic(row, col)

      const sqEl = document.createElement("div")
      sqEl.classList.add("square", (row + col) % 2 === 0 ? "light" : "dark")
      sqEl.dataset.row = row
      sqEl.dataset.col = col

      if (lastMove) {
        if (alg === lastMove.from) sqEl.classList.add("last-from")
        if (alg === lastMove.to)   sqEl.classList.add("last-to")
      }

      if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
        sqEl.classList.add("highlight")
      }

      const isPossible = possibleMoves.includes(alg)
      if (isPossible) {
        if (square && square.color !== playerRole) {
          sqEl.classList.add("can-capture")
        } else {
          const dot = document.createElement("div")
          dot.className = "move-dot"
          sqEl.appendChild(dot)
        }
      }

      if (square) {
        const pieceEl = document.createElement("div")
        pieceEl.classList.add("piece", square.color === "w" ? "white" : "black")
        pieceEl.innerText = getPieceUnicode(square)

        const isMyPiece = playerRole === square.color
        const isMyTurn  = chess.turn() === playerRole
        pieceEl.draggable = isMyPiece && isMyTurn

        pieceEl.addEventListener("dragstart", (e) => {
          if (!pieceEl.draggable) { e.preventDefault(); return }
          draggedPiece = pieceEl
          sourceSquare = { row, col }
          selectedSquare = { row, col }
          possibleMoves = chess.moves({ square: alg, verbose: true }).map(m => m.to)
          pieceEl.classList.add("dragging")
          e.dataTransfer.setData("text/plain", "")
          setTimeout(() => renderBoard(), 0)
        })

        pieceEl.addEventListener("dragend", () => {
          if (draggedPiece) draggedPiece.classList.remove("dragging")
          draggedPiece = null
        })

        pieceEl.addEventListener("click", (e) => {
          e.stopPropagation()
          if (!isMyPiece) return
          if (selectedSquare && selectedSquare.row === row && selectedSquare.col === col) {
            selectedSquare = null
            possibleMoves = []
          } else {
            selectedSquare = { row, col }
            possibleMoves = chess.moves({ square: alg, verbose: true }).map(m => m.to)
          }
          renderBoard()
        })

        sqEl.appendChild(pieceEl)
      }

      sqEl.addEventListener("dragover", (e) => e.preventDefault())
      sqEl.addEventListener("drop", (e) => {
        e.preventDefault()
        if (!sourceSquare) return
        const targetRow = parseInt(sqEl.dataset.row)
        const targetCol = parseInt(sqEl.dataset.col)
        handleMove(sourceSquare, { row: targetRow, col: targetCol })
        draggedPiece = null
        sourceSquare = null
      })

      sqEl.addEventListener("click", () => {
        if (selectedSquare) {
          const targetAlg = toAlgebraic(row, col)
          if (possibleMoves.includes(targetAlg)) {
            handleMove(selectedSquare, { row, col })
            selectedSquare = null
            possibleMoves = []
          } else {
            selectedSquare = null
            possibleMoves = []
            renderBoard()
          }
        }
      })

      boardElement.appendChild(sqEl)
    })
  })

  updateLabels()
  updateStatus()
}

// ─── Handle Move ───────────────────────────────────────────────────────────────
const handleMove = (source, target) => {
  if (!source || !target) return
  if (chess.turn() !== playerRole) return

  const from = toAlgebraic(source.row, source.col)
  const to   = toAlgebraic(target.row, target.col)
  const piece = chess.get(from)

  const isPromotion =
    piece && piece.type === "p" &&
    ((piece.color === "w" && target.row === 0) ||
     (piece.color === "b" && target.row === 7))

  const move = { from, to, promotion: isPromotion ? "q" : undefined }
  const result = chess.move(move)

  if (result) {
    lastMove = { from, to }
    updateMoveHistory(result.san)
    socket.emit("move", { roomId, move })
    selectedSquare = null
    possibleMoves = []
    renderBoard()
  } else {
    boardElement.classList.add("shake")
    setTimeout(() => boardElement.classList.remove("shake"), 400)
    selectedSquare = null
    possibleMoves = []
    renderBoard()
  }
}

// ─── Unicode Pieces ────────────────────────────────────────────────────────────
const getPieceUnicode = (piece) => {
  const map = {
    wp:"♙", wn:"♘", wb:"♗", wr:"♖", wq:"♕", wk:"♔",
    bp:"♟", bn:"♞", bb:"♝", br:"♜", bq:"♛", bk:"♚",
  }
  return map[piece.color + piece.type] || ""
}

// ─── Status Bar ────────────────────────────────────────────────────────────────
const updateStatus = () => {
  const el = document.getElementById("status")
  if (!el) return
  if (chess.in_checkmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White"
    el.textContent = `Checkmate! ${winner} wins 🏆`
    el.className = "status checkmate"
  } else if (chess.in_draw()) {
    el.textContent = "Draw! 🤝"
    el.className = "status draw"
  } else if (chess.in_check()) {
    const inCheck = chess.turn() === "w" ? "White" : "Black"
    el.textContent = `${inCheck} is in Check! ⚠️`
    el.className = "status check"
  } else if (!playerRole) {
    el.textContent = "👀 Spectating"
    el.className = "status spectator"
  } else {
    const isMyTurn = chess.turn() === playerRole
    const turnLabel = chess.turn() === "w" ? "White" : "Black"
    el.textContent = isMyTurn ? `Your turn (${turnLabel}) ♟` : `${turnLabel}'s turn…`
    el.className = isMyTurn ? "status your-turn" : "status waiting"
  }
}

// ─── Socket Events ─────────────────────────────────────────────────────────────
socket.on("playerRole", (role) => {
  playerRole = role
  const el = document.getElementById("player-role")
  if (el) el.textContent = role === "w" ? "White ♔" : "Black ♚"
  renderBoard()
})

socket.on("spectatorRole", () => {
  playerRole = null
  const el = document.getElementById("player-role")
  if (el) el.textContent = "Spectating 👀"
  renderBoard()
})

socket.on("move", (move) => {
  const result = chess.move(move)
  if (result) {
    lastMove = { from: move.from, to: move.to }
    updateMoveHistory(result.san)
  }
  renderBoard()
})

socket.on("boardState", (fen) => {
  chess.load(fen)
  renderBoard()
})

socket.on("playerDisconnected", (color) => {
  const el = document.getElementById("status")
  if (el) {
    el.textContent = `${color} player disconnected. Waiting for new player…`
    el.className = "status waiting"
  }
  chess.reset()
  moveHistory = []
  lastMove = null
  renderBoard()
})

socket.on("gameOver", ({ reason, winner }) => {
  const el = document.getElementById("status")
  if (!el) return
  el.textContent = reason === "checkmate"
    ? `Checkmate! ${winner} wins! 🏆`
    : `Game drawn by ${reason}! 🤝`
  el.className = "status checkmate"
})

socket.on("invalidMove", () => {
  socket.emit("requestSync")
})

socket.on("connect_error", (err) => {
  // if token is missing or invalid, redirect to login
  if (err.message === "No token provided" || err.message === "Invalid token") {
    window.location.href = "/login"
  }
})

// ─── Join Room on page load ─────────────────────────────────────────────────
if (typeof roomId !== 'undefined' && roomId) {
  socket.emit("joinRoom", roomId)
}

// ─── Initial Render ────────────────────────────────────────────────────────────
renderBoard()