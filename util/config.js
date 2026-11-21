require('dotenv').config({ path: process.env.NODE_ENV === 'test' ? '.env.test' : '.env' })

const {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_PORT,
  PORT,
  SECRET
} = process.env

module.exports = {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  DB_HOST,
  DB_PORT,
  PORT,
  SECRET
}
