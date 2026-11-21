const { Sequelize } = require('sequelize')
const config = require('./config')

const sequelize = new Sequelize(
  config.DB_NAME,
  config.DB_USER,
  config.DB_PASSWORD,
  {
    host: config.DB_HOST,
    port: Number(config.DB_PORT),
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'test' ? false : console.log
  }
)

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

