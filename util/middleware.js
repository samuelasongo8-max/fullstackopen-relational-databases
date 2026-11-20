
const errorHandler = (error, request, response, next) => {
  console.error('Error caught:', error.name, error.message)

  if (
    error.name === 'SequelizeValidationError' ||
    error.name === 'SequelizeUniqueConstraintError'
  ) {
    const messages = error.errors.map(e => e.message)

    return response.status(400).json({ error: messages })
  }

  if (error.name === 'SequelizeDatabaseError') {
    return response.status(400).json({ error: error.message })
  }

  console.error(error.stack)

  response.status(500).json({ error: 'Something went wrong' })
}

module.exports = {
  errorHandler
}
