const express = require('express')
const jwt = require('jsonwebtoken')
const { Blog, User } = require('../models')
const { Op } = require('sequelize')

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
    try {
      const user = await User.findByPk(request.decodedToken.id)
      if (!user) {
        return response.status(401).json({ error: 'invalid token' })
      }
      request.user = user
    } catch (error) {
      return next(error)
    }
  }
  next()
}

// POST /api/blogs - create a new blog
router.post('/', tokenExtractor, userExtractor, async (req, res, next) => {
  try {
    const user = req.user
    if (!user) {
      return res.status(401).json({ error: 'unknown user' })
    }
    const blog = await Blog.create({
      title: req.body.title,
      author: req.body.author,
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
router.delete('/:id', tokenExtractor, userExtractor, async (req, res, next) => {
  try {
    const blog = await Blog.findByPk(req.params.id)
    if (!blog) {
      return res.status(404).end()
    }
    if (Number(blog.userId) !== Number(req.user.id)) {
      return res.status(403).json({
        error: 'Forbidden: You are not the owner of this blog'
      })
    }
    await blog.destroy()
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

// GET /api/blogs - return all blogs with their associated user
router.get('/', async (req, res, next) => {
  try {
    const where = {}
    if (req.query.search) {
      where[Op.or] = [
        {
          title: {
            [Op.iLike]: `%${req.query.search}%`
          }
        },
        {
          author: {
            [Op.iLike]: `%${req.query.search}%`
          }
        }
      ]
    }
    const blogs = await Blog.findAll({
      where,
      order: [['likes', 'DESC']],
      include: {
        model: User,
        attributes: ['id', 'name', 'username'],
        as: 'user'
      }
    })
    res.json(blogs)
  } catch (error) {
    next(error)
  }
})

module.exports = router

