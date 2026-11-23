const { Sequelize } = require('sequelize')
const config = require('./config')

const databaseUrl = process.env.TESTING === 'true' ? config.TEST_DATABASE_URL : config.DATABASE_URL

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'test' ? false : console.log
})

const connectToDatabase = async () => {
  try {
    await sequelize.authenticate()
    console.log('Database connected successfully')
  } catch (error) {
    console.error('Unable to connect to database:', error.message)
    throw error
  }
}

module.exports = {
  sequelize,
  connectToDatabase
}

