
require('dotenv').config()

const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    dialect: 'postgres',
    logging: console.log
  }
)

const main = async () => {
  try {
    const blogs = await sequelize.query(
      'SELECT * FROM blogs',
      { type: Sequelize.QueryTypes.SELECT }
    )

    blogs.forEach(blog => {
      console.log(`${blog.author}: '${blog.title}', ${blog.likes} likes`)
    })
  } catch (error) {
    console.error('Database connection failed:', error.message)
  } finally {
    await sequelize.close()
  }
}

main()
