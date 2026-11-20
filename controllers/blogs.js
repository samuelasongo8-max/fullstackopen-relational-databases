const express = require('express')
const jwt = require('jsonwebtoken')
const { Blog, User } = require('../models')

const router = express.Router()

// Middleware to extract user from token
const tokenExtractor = (request, response, next) => {
  const authorization = request.get('authorization')
  if (authorization && authorization.startsWith('Bearer ')) {
    const token = authorization.replace('Bearer ', '')
    jwt.verify(token, process.env.SECRET, (error, decoded) => {
      if (error) {
        return response.status(401).json({ error: 'invalid token' })
      }
      request.decodedToken = decoded
      next()
    })
  } else {
    response.status(401).json({ error: 'missing token' })
  }
}

// Middleware to find user from token
const userExtractor = async (request, response, next) => {
  if (request.decodedToken && request.decodedToken.id) {
    const user = await User.findByPk(request.decodedToken.id)
    request.user = user
  }
  next()
}

// POST /api/blogs - create a new blog
router.post('/', tokenExtractor, userExtractor, async (req, res, next) => {
  try {
    const user = request.user
    if (!user) {
      return res.status(401).json({ error: 'unknown user' })
    }
    const blog = await Blog.create({
      title: req.body.title,
      url: req.body.url,
      userId: user.id
    })
    res.status(201).json(blog)
  } catch (error) {
    next(error)
  }
})

// PUT /api/blogs/:id - update likes of a blog
router.put('/:id', async (req, res, next) => {
  try {
    const blog = await Blog.findByPk(req.params.id)
    if (!blog) {
      return res.status(404).end()
    }
    blog.likes = req.body.likes
    await blog.save()
    res.json(blog)
  } catch (error) {
    next(error)
  }
})

// DELETE /api/blogs/:id - delete a blog by ID
router.delete('/:id', async (req, res, next) => {
  try {
    const blog = await Blog.findByPk(req.params.id)
    if (!blog) {
      return res.status(404).end()
    }
    await blog.destroy()
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

module.exports = router

