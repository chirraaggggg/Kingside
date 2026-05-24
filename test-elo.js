const calculateElo = (winnerElo, loserElo) => {
  const K = 32
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400))
  const expectedLoser  = 1 / (1 + Math.pow(10, (winnerElo - loserElo) / 400))
  return {
    newWinnerElo: Math.round(winnerElo + K * (1 - expectedWinner)),
    newLoserElo:  Math.round(loserElo  + K * (0 - expectedLoser))
  }
}

// test: two equal players at 1200
console.log(calculateElo(1200, 1200))

// test: underdog wins
console.log(calculateElo(1000, 1400))

// test: favourite wins
console.log(calculateElo(1400, 1000))