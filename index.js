const express = require('express')
const jwt = require('jsonwebtoken')
const config = require('./util/config')
const { sequelize, connectToDatabase } = require('./util/db')
const User = require('./models/user')
const blogsRouter = require('./controllers/blogs')
const usersRouter = require('./controllers/users')

const app = express()

app.use(express.json())
app.use('/api/blogs', blogsRouter)
app.use('/api/users', usersRouter)

// Login route
app.post('/api/login', async (req, res, next) => {
  try {
    const { username, password } = req.body
    const user = await User.findOne({ where: { username } })
    if (!user) {
      return res.status(401).json({ error: 'invalid username or password' })
    }
    const passwordCorrect = await user.correctPassword(password)
    if (!passwordCorrect) {
      return res.status(401).json({ error: 'invalid username or password' })
    }
    const userForToken = {
      username: user.username,
      id: user.id
    }
    const token = jwt.sign(userForToken, process.env.SECRET)
    res.json({ token, username: user.username, name: user.name })
  } catch (error) {
    next(error)
  }
})

const { errorHandler } = require('./util/middleware')

// Centralized error handling middleware
app.use(errorHandler)

const start = async () => {
  try {
    await connectToDatabase()
    await User.sync()
    console.log('User table synchronized successfully')
    app.listen(config.PORT || 3001, () => {
      console.log(`Server running on port ${config.PORT || 3001}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
  }
}

if (process.env.NODE_ENV !== 'test') {
  start()
}

module.exports = { app, start, sequelize }

