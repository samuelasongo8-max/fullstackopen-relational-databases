const express = require('express')
const jwt = require('jsonwebtoken')
const config = require('./util/config')
const { sequelize, connectToDatabase } = require('./util/db')
const { Sequelize } = require('sequelize')
const { User, Blog } = require('./models')
const blogsRouter = require('./controllers/blogs')
const usersRouter = require('./controllers/users')

const app = express()

app.use(express.json())
app.use('/api/blogs', blogsRouter)
app.use('/api/users', usersRouter)

// GET / - root endpoint
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Blog API is running' })
})

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

// GET /api/authors - return authors with blog counts and total likes
app.get('/api/authors', async (req, res, next) => {
  try {
    const authors = await Blog.findAll({
      attributes: [
        'author',
        [Sequelize.fn('COUNT', Sequelize.col('id')), 'blogs'],
        [Sequelize.fn('SUM', Sequelize.col('likes')), 'likes']
      ],
      group: 'author',
      order: [[Sequelize.fn('SUM', Sequelize.col('likes')), 'DESC']],
      raw: true
    })
    const formattedAuthors = authors.map(author => ({
      author: author.author,
      blogs: String(author.blogs),
      likes: String(author.likes)
    }))
    res.json(formattedAuthors)
  } catch (error) {
    next(error)
  }
})

// POST /api/reset - reset database tables (test environment only)
app.post('/api/reset', async (req, res, next) => {
  try {
    // Only allow reset in test environment
    if (process.env.TESTING !== 'true') {
      return res.status(403).json({ error: 'Database reset is only available in test environment' })
    }

    // Use a transaction to ensure atomicity and proper order
    const transaction = await sequelize.transaction(async (t) => {
      // Delete all blogs first (they reference users via userId foreign key)
      await Blog.destroy({ where: {}, transaction: t })
      // Then delete all users
      await User.destroy({ where: {}, transaction: t })
    })

    res.status(200).json({ message: 'Database reset successfully' })
  } catch (error) {
    next(error)
  }
})

// Centralized error handling middleware
const { errorHandler } = require('./util/middleware')
app.use(errorHandler)

// Only start the server when not in test mode
const start = async () => {
  try {
    await connectToDatabase()
    await sequelize.sync()
    console.log('Database tables synchronized successfully')
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

// Export app and sequelize for testing
module.exports = { app, start, sequelize }
