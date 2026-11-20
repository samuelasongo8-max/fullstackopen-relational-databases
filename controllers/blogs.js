const express = require('express')
const { Blog } = require('../models')

const router = express.Router()

// Middleware to find blog by ID
const blogFinder = async (req, res, next) => {
  const blog = await Blog.findByPk(req.params.id)
  if (!blog) {
    return res.status(404).end()
  }
  req.blog = blog
  next()
}

// GET /api/blogs - retrieve all blogs
router.get('/', async (req, res) => {
  const blogs = await Blog.findAll()
  res.json(blogs)
})

// POST /api/blogs - create a new blog
router.post('/', async (req, res) => {
  const blog = await Blog.create(req.body)
  res.status(201).json(blog)
})

// DELETE /api/blogs/:id - delete a blog by ID
router.delete('/:id', blogFinder, async (req, res) => {
  await req.blog.destroy()
  res.status(204).end()
})

module.exports = router
