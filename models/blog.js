
const { DataTypes } = require('sequelize')
const { sequelize } = require('../util/db')

const Blog = sequelize.define('blog', {
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER
  },
  author: {
    type: DataTypes.STRING
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  likes: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  timestamps: false
})

module.exports = Blog

