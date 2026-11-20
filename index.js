const express = require('express')
const config = require('./util/config')
const { sequelize, connectToDatabase } = require('./util/db')
const User = require('./models/user')
const blogsRouter = require('./controllers/blogs')
const usersRouter = require('./controllers/users')

const app = express()

app.use(express.json())
app.use('/api/blogs', blogsRouter)
app.use('/api/users', usersRouter)

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

start()

