const isTestEnvironment =
  process.env.NODE_ENV === 'test' || process.env.TESTING === 'true'

require('dotenv').config({
  path: isTestEnvironment ? '.env.test' : '.env'
})

const {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_PORT,
  PORT,
  SECRET,
  TEST_DATABASE_URL,
  DATABASE_URL
} = process.env

module.exports = {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_PORT,
  PORT,
  SECRET,
  TEST_DATABASE_URL,
  DATABASE_URL
}
