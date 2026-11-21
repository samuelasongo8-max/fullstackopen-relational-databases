process.env.NODE_ENV = 'test'

const { app, sequelize } = require('../index')
const { Blog, User } = require('../models')
const request = require('supertest')
const jwt = require('jsonwebtoken')

const SECRET = process.env.SECRET || 'test-secret-key'

describe('Blog deletion ownership authorization', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true })
  })

  afterAll(async () => {
    await sequelize.close()
  })

  afterEach(async () => {
    await Blog.destroy({ where: {}, truncate: true, cascade: true })
    await User.destroy({ where: {}, truncate: true, cascade: true })
  })

  const createUserAndToken = async (overrides = {}) => {
    const user = await User.create({
      name: overrides.name || 'Test User',
      username: overrides.username || `user${Date.now()}@example.com`,
      password: overrides.password || 'password123'
    })
    const token = jwt.sign({ username: user.username, id: user.id }, SECRET)
    return { user, token }
  }

  const createBlog = async (user, overrides = {}) => {
    return await Blog.create({
      title: overrides.title || 'Test Blog',
      url: overrides.url || 'https://example.com/blog',
      userId: user.id,
      author: overrides.author || user.name
    })
  }

  // Test 1: Blog owner deletes their own blog
  test('Test 1: Blog owner can delete their own blog - HTTP 204', async () => {
    const { user, token } = await createUserAndToken()
    const blog = await createBlog(user)

    const response = await request(app)
      .delete(`/api/blogs/${blog.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204)

    const deletedBlog = await Blog.findByPk(blog.id)
    expect(deletedBlog).toBeNull()
  })

  // Test 2: Another user attempts to delete the blog
  test('Test 2: Another user receives HTTP 403 - blog remains', async () => {
    const { user: userA } = await createUserAndToken({ username: 'usera@example.com' })
    const { user: userB, token: tokenB } = await createUserAndToken({ username: 'userb@example.com' })

    const blog = await createBlog(userA)

    const response = await request(app)
      .delete(`/api/blogs/${blog.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(403)

    expect(response.body.error).toContain('owner')

    const existingBlog = await Blog.findByPk(blog.id)
    expect(existingBlog).not.toBeNull()
    expect(existingBlog.userId).toBe(userA.id)
  })

  // Test 3: Unauthenticated visitor attempts deletion
  test('Test 3: Unauthenticated visitor receives HTTP 401 - blog remains', async () => {
    const { user } = await createUserAndToken()
    const blog = await createBlog(user)

    const response = await request(app)
      .delete(`/api/blogs/${blog.id}`)
      .expect(401)

    const existingBlog = await Blog.findByPk(blog.id)
    expect(existingBlog).not.toBeNull()
  })

  // Test 4: Invalid JWT
  test('Test 4: Invalid JWT receives HTTP 401', async () => {
    const { user } = await createUserAndToken()
    const blog = await createBlog(user)

    const response = await request(app)
      .delete(`/api/blogs/${blog.id}`)
      .set('Authorization', 'Bearer invalid.jwt.token')
      .expect(401)

    const existingBlog = await Blog.findByPk(blog.id)
    expect(existingBlog).not.toBeNull()
  })

  // Test 5: Valid token belonging to a deleted user
  test('Test 5: Valid token for deleted user receives HTTP 401', async () => {
    const { user: userToDelete, token: deletedUserToken } = await createUserAndToken()
    const { user: blogOwner } = await createUserAndToken({ username: 'blogowner@example.com' })

    // Create a blog owned by a different user (so it won't be cascade-deleted)
    const blog = await createBlog(blogOwner)

    // Delete the user's blogs first (due to foreign key constraint), then the user
    await Blog.destroy({ where: { userId: userToDelete.id } })
    await User.destroy({ where: { id: userToDelete.id } })

    const response = await request(app)
      .delete(`/api/blogs/${blog.id}`)
      .set('Authorization', `Bearer ${deletedUserToken}`)
      .expect(401)

    // The blog still exists (owned by a different user)
    const existingBlog = await Blog.findByPk(blog.id)
    expect(existingBlog).not.toBeNull()
  })

  // Test 6: Nonexistent blog
  test('Test 6: Nonexistent blog receives HTTP 404', async () => {
    const { user, token } = await createUserAndToken()

    const response = await request(app)
      .delete('/api/blogs/999999')
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
  })

  // Test 7: Successful deletion does not affect other blogs
  test('Test 7: Deleting one blog does not affect other blogs', async () => {
    const { user: userA, token: tokenA } = await createUserAndToken({ username: 'usera@example.com' })
    const { user: userB } = await createUserAndToken({ username: 'userb@example.com' })

    const blogA = await createBlog(userA, { title: 'Blog A' })
    const blogB = await createBlog(userB, { title: 'Blog B' })

    // User A deletes their own blog
    await request(app)
      .delete(`/api/blogs/${blogA.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204)

    // User B's blog still exists
    const existingBlogB = await Blog.findByPk(blogB.id)
    expect(existingBlogB).not.toBeNull()
    expect(existingBlogB.title).toBe('Blog B')

    // User A's blog is gone
    const existingBlogA = await Blog.findByPk(blogA.id)
    expect(existingBlogA).toBeNull()
  })

  // Test 8: Existing application functionality
  test('Test 8a: Login still works', async () => {
    await User.create({
      name: 'Test User',
      username: 'login@example.com',
      password: 'password123'
    })

    const response = await request(app)
      .post('/api/login')
      .send({ username: 'login@example.com', password: 'password123' })
      .expect(200)

    expect(response.body.token).toBeDefined()
    expect(response.body.username).toBe('login@example.com')
  })

  test('Test 8b: Blog creation still works', async () => {
    const { user, token } = await createUserAndToken()

    const response = await request(app)
      .post('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'New Blog', url: 'https://example.com/new' })
      .expect(201)

    expect(response.body.title).toBe('New Blog')
    expect(response.body.userId).toBe(user.id)
  })

  test('Test 8c: GET /api/blogs returns all blogs with associated users', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'My Blog' })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBeGreaterThan(0)
    expect(response.body[0]).toHaveProperty('user')
    expect(response.body[0].user).toHaveProperty('id')
    expect(response.body[0].user).toHaveProperty('name')
    expect(response.body[0].user).toHaveProperty('username')
    expect(response.body[0].user).not.toHaveProperty('passwordHash')
  })

  test('Test 8d: Blog editing still works', async () => {
    const { user, token } = await createUserAndToken()
    const blog = await createBlog(user)

    const response = await request(app)
      .put(`/api/blogs/${blog.id}`)
      .send({ likes: 5 })
      .expect(200)

    expect(response.body.likes).toBe(5)
  })

  test('Test 8e: Missing token returns HTTP 401', async () => {
    const { user } = await createUserAndToken()
    const blog = await createBlog(user)

    await request(app)
      .post('/api/blogs')
      .send({ title: 'No Token Blog', url: 'https://example.com/notoken' })
      .expect(401)
  })

  test('Test 8f: Unknown user returns HTTP 401 on blog creation', async () => {
    const { user, token } = await createUserAndToken()
    await User.destroy({ where: { id: user.id } })

    await request(app)
      .post('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Orphan Blog', url: 'https://example.com/orphan' })
      .expect(401)
  })

  // Exercise 12: GET /api/users includes blogs
  test('Test 9a: GET /api/users returns all users with their blogs', async () => {
    const { user: userA } = await createUserAndToken({ username: 'usera@example.com' })
    const { user: userB } = await createUserAndToken({ username: 'userb@example.com' })

    await createBlog(userA, { title: 'Blog A' })
    await createBlog(userA, { title: 'Blog B' })
    await createBlog(userB, { title: 'Blog C' })

    const response = await request(app)
      .get('/api/users')
      .expect(200)

    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBeGreaterThanOrEqual(2)

    const userAResponse = response.body.find(u => u.username === 'usera@example.com')
    expect(userAResponse).toBeDefined()
    expect(userAResponse.blogs).toBeDefined()
    expect(Array.isArray(userAResponse.blogs)).toBe(true)
    expect(userAResponse.blogs.length).toBe(2)
    expect(userAResponse.blogs[0]).toHaveProperty('id')
    expect(userAResponse.blogs[0]).toHaveProperty('title')
    expect(userAResponse.blogs[0]).toHaveProperty('url')
    expect(userAResponse.blogs[0]).toHaveProperty('likes')
    expect(userAResponse).not.toHaveProperty('passwordHash')
  })

  test('Test 9b: User without blogs is returned with empty blogs array', async () => {
    const { user: userB } = await createUserAndToken({ username: 'noblogs@example.com' })

    const response = await request(app)
      .get('/api/users')
      .expect(200)

    const userBResponse = response.body.find(u => u.username === 'noblogs@example.com')
    expect(userBResponse).toBeDefined()
    expect(userBResponse.blogs).toBeDefined()
    expect(Array.isArray(userBResponse.blogs)).toBe(true)
    expect(userBResponse.blogs.length).toBe(0)
  })

  test('Test 9c: User blogs do not include userId foreign key', async () => {
    const { user: userA } = await createUserAndToken({ username: 'blogsuser@example.com' })
    await createBlog(userA, { title: 'Blog X' })

    const response = await request(app)
      .get('/api/users')
      .expect(200)

    const userAResponse = response.body.find(u => u.username === 'blogsuser@example.com')
    expect(userAResponse.blogs.length).toBeGreaterThan(0)
    expect(userAResponse.blogs[0]).not.toHaveProperty('userId')
  })

  test('Test 9d: GET /api/blogs includes user without passwordHash', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user)

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body[0].user).not.toHaveProperty('passwordHash')
    expect(response.body[0].user).not.toHaveProperty('password')
  })

  // Exercise 13: Search
  test('Test 10a: GET /api/blogs returns all blogs when no search parameter', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React' })
    await createBlog(user, { title: 'Learning Node.js' })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBe(2)
  })

  test('Test 10b: GET /api/blogs?search=react returns matching blogs', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React' })
    await createBlog(user, { title: 'React and Node.js' })
    await createBlog(user, { title: 'Learning JavaScript' })

    const response = await request(app)
      .get('/api/blogs?search=react')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBe(2)
    expect(response.body.some(b => b.title === 'Learning React')).toBe(true)
    expect(response.body.some(b => b.title === 'React and Node.js')).toBe(true)
    expect(response.body.some(b => b.title === 'Learning JavaScript')).toBe(false)
  })

  test('Test 10c: Search is case-insensitive', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React' })
    await createBlog(user, { title: 'React and Node.js' })

    const response = await request(app)
      .get('/api/blogs?search=REACT')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(2)
  })

  test('Test 10d: Search matches keyword anywhere in title', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React' })
    await createBlog(user, { title: 'Introduction to React.js' })
    await createBlog(user, { title: 'React Basics' })

    const response = await request(app)
      .get('/api/blogs?search=react')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(3)
  })

  test('Test 10e: Blogs without matching keyword are excluded', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React' })
    await createBlog(user, { title: 'Learning JavaScript' })
    await createBlog(user, { title: 'Node.js Basics' })

    const response = await request(app)
      .get('/api/blogs?search=react')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(1)
    expect(response.body[0].title).toBe('Learning React')
  })

  test('Test 10f: Empty search parameter returns all blogs', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React' })
    await createBlog(user, { title: 'Learning Node.js' })

    const response = await request(app)
      .get('/api/blogs?search=')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(2)
  })

  test('Test 10g: Search results include associated user information', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React' })

    const response = await request(app)
      .get('/api/blogs?search=react')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body[0].user).toBeDefined()
    expect(response.body[0].user).toHaveProperty('id')
    expect(response.body[0].user).toHaveProperty('name')
    expect(response.body[0].user).toHaveProperty('username')
    expect(response.body[0].user).not.toHaveProperty('passwordHash')
  })
})