const { DataTypes } = require('sequelize')
const { sequelize } = require('../util/db')

const User = sequelize.define('user', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Name must not be empty'
      }
    }
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: {
        msg: 'Username must not be empty'
      }
    }
  }
}, {
  timestamps: true
})

module.exports = User
