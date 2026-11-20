const { DataTypes } = require('sequelize')
const { sequelize } = require('../util/db')
const bcrypt = require('bcryptjs')

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
    unique: {
      msg: 'username must be unique'
    },
    validate: {
      notEmpty: {
        msg: 'Username must not be empty'
      },
      isEmail: {
        msg: 'username must be a valid email address'
      }
    }
  },
  password: {
    type: DataTypes.VIRTUAL,
    set: function (value) {
      this._password = value
    }
  },
  passwordHash: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: {
        msg: 'Password must not be empty'
      },
      len: {
        args: [8],
        msg: 'Password must be at least 8 characters long'
      }
    },
    field: 'password_hash'
  }
}, {
  timestamps: true,
  hooks: {
    beforeValidate: async (user, options) => {
      if (user._password) {
        const saltRounds = 10
        user.passwordHash = await bcrypt.hash(user._password, saltRounds)
      }
    }
  }
})

User.prototype.toJSON = function () {
  const values = { ...this.get() }
  delete values.password
  delete values.passwordHash
  return values
}

User.prototype.correctPassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash)
}

// Associations will be set up in models/index.js

module.exports = User
