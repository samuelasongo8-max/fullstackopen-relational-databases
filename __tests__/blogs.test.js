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
    const { user, token } = await createUserAndToken()
    const blog = await createBlog(user)

    await User.destroy({ where: { id: user.id } })

    const response = await request(app)
      .delete(`/api/blogs/${blog.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(401)

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

  test('Test 8c: Blog listing endpoint returns 404 (not implemented)', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user)

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(404)
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
})