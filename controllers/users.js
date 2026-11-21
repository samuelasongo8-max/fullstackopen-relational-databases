const express = require('express')
const jwt = require('jsonwebtoken')
const { User, Blog } = require('../models')
const bcrypt = require('bcryptjs')

const router = express.Router()

// POST /api/users - create new user
router.post('/', async (req, res, next) => {
  try {
    const { name, username, password } = req.body
    if (!password) {
      return res.status(400).json({ error: 'Password is required' })
    }
    const user = await User.create({ name, username, password })
    res.status(201).json(user)
  } catch (error) {
    next(error)
  }
})

// POST /api/login - login
router.post('/login', async (req, res, next) => {
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

// GET /api/users - return all users with their blogs
router.get('/', async (req, res, next) => {
  try {
    const users = await User.findAll({
      attributes: {
        exclude: ['passwordHash']
      },
      include: {
        model: Blog,
        as: 'blogs',
        attributes: { exclude: ['userId'] }
      }
    })
    res.json(users)
  } catch (error) {
    next(error)
  }
})

// PUT /api/users/:username - update name of user by username
router.put('/:username', async (req, res, next) => {
  try {
    const user = await User.findOne({ where: { username: req.params.username } })
    if (!user) {
      return res.status(404).end()
    }
    user.name = req.body.name
    await user.save()
    res.json(user)
  } catch (error) {
    next(error)
  }
})

// GET /api/users/:id - get user details by ID
router.get('/:id', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.params.id)
    if (!user) {
      return res.status(404).end()
    }
    res.json(user)
  } catch (error) {
    next(error)
  }
})

module.exports = router
