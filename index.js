
const express = require('express')
const Blog = require('./models/blog')
const sequelize = require('./util/db')

const app = express()

app.use(express.json())

// GET: Retrieve all blogs
app.get('/api/blogs', async (req, res) => {
  const blogs = await Blog.findAll()
  res.json(blogs)
})

// POST: Add a new blog
app.post('/api/blogs', async (req, res) => {
  const blog = await Blog.create(req.body)
  res.status(201).json(blog)
})

// DELETE: Delete a blog by ID
app.delete('/api/blogs/:id', async (req, res) => {
  const deletedRows = await Blog.destroy({
    where: {
      id: req.params.id
    }
  })

  if (deletedRows === 0) {
    return res.status(404).end()
  }

  res.status(204).end()
})

// Start the server
const PORT = 3001

const start = async () => {
  try {
    await sequelize.authenticate()
    console.log('Database connected successfully')

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  } catch (error) {
    console.error('Unable to connect to database:', error.message)
  }
}

start()
