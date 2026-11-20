const express = require('express')
const { User } = require('../models')

const router = express.Router()

// POST /api/users - create new user
router.post('/', async (req, res, next) => {
  try {
    // Extract only name and username explicitly to ignore password or other fields
    const { name, username } = req.body
    const userFields = { name, username }
    const user = await User.create(userFields)
    res.status(201).json(user)
  } catch (error) {
    next(error)
  }
})

// GET /api/users - return all users
router.get('/', async (req, res, next) => {
  try {
    const users = await User.findAll()
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
