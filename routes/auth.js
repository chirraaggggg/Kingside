const express = require('express')
const router = express.Router()
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const pool = require('../db')

// POST /register
// this is the RULEBOOK - defined once outside
const registrationRules = [
  body('username').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 })
]

// 1. get username, email, password from req.body
router.post('/register', registrationRules, async (req, res) => {
  try {
    const { username, email, password } = req.body

    // 2. validate - are fields empty? is email valid?
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // 3. check if email already exists in DB
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // 4. hash the password with bcrypt
    const hashPassword = await bcrypt.hash(password, 12);

    // 5. save user to DB
    const newUser = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [username, email, hashPassword]
    )

    // 6. return success - remove password_hash before sending user back
    const { password_hash, ...userWithoutPassword } = newUser.rows[0]
    res.status(201).json({
      message: "User registered successfully",
      token: jwt.sign(
        { id: newUser.rows[0].id, username: newUser.rows[0].username },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
      ),
      user: userWithoutPassword,
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
});

// POST /login
router.post('/login', async (req, res) => {
  try {
    // 1. get email, password from req.body
    const { email, password } = req.body;

    // 2. validate - are fields empty?
    const error = validationResult(req);
    if (!error.isEmpty()) {
      return res.status(400).json({ errors: error.array() });
    }

    // 3. find user by email in DB
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    // 4. if no user found → return 401
    if (user.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // 5. compare password with stored hash using bcrypt
    const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);

    // 6. if wrong password → return 401
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid email or password" })
    }

    // 7. sign a JWT with the user's id and username
    const token = jwt.sign(
      { id: user.rows[0].id, username: user.rows[0].username },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    // 8. return the token as JSON
    const { password_hash, ...userWithoutPassword } = user.rows[0]
    res.status(200).json({
      message: "Login successful",
      token: token,
      user: userWithoutPassword,
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
});

module.exports = router