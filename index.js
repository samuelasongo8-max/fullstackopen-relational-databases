const express = require('express')
const config = require('./util/config')
const { sequelize, connectToDatabase } = require('./util/db')
const blogsRouter = require('./controllers/blogs')

const app = express()

app.use(express.json())
app.use('/api/blogs', blogsRouter)

const start = async () => {
  try {
    await connectToDatabase()
    app.listen(config.PORT || 3001, () => {
      console.log(`Server running on port ${config.PORT || 3001}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
  }
}

start()
