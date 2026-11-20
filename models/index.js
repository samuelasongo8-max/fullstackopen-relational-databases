const Blog = require('./blog')
const User = require('./user')

// Set up associations
Blog.associate = (models) => {
  Blog.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  })
}

User.associate = (models) => {
  User.hasMany(models.Blog, {
    foreignKey: 'userId',
    as: 'blogs'
  })
}

module.exports = { Blog, User }
