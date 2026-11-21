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
      author: overrides.author || user.name,
      likes: overrides.likes !== undefined ? overrides.likes : 0
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

  // Exercise 14: Better Search - title AND author fields
  test('Test 11a: Keyword found in title returns the blog', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe' })

    const response = await request(app)
      .get('/api/blogs?search=react')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(1)
    expect(response.body[0].title).toBe('Learning React')
  })

  test('Test 11b: Keyword found in author returns the blog', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'JavaScript Basics', author: 'Jamie Smith' })

    const response = await request(app)
      .get('/api/blogs?search=jami')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(1)
    expect(response.body[0].author).toBe('Jamie Smith')
  })

  test('Test 11c: Keyword found in either field returns the blog', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe' })
    await createBlog(user, { title: 'Node.js Guide', author: 'Jamie Smith' })
    await createBlog(user, { title: 'Python Intro', author: 'Alice Brown' })

    const response = await request(app)
      .get('/api/blogs?search=jami')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(1)
    expect(response.body[0].author).toBe('Jamie Smith')
  })

  test('Test 11d: Keyword absent from both fields excludes the blog', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe' })
    await createBlog(user, { title: 'Node.js Guide', author: 'Jane Smith' })

    const response = await request(app)
      .get('/api/blogs?search=python')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(0)
  })

  test('Test 11e: Search is case-insensitive in the title', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe' })

    const response = await request(app)
      .get('/api/blogs?search=REACT')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(1)
  })

  test('Test 11f: Search is case-insensitive in the author', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'JavaScript Basics', author: 'Jamie Smith' })

    const response = await request(app)
      .get('/api/blogs?search=JAMIE')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(1)
  })

  test('Test 11g: Partial matching works in both fields', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Introduction to React.js', author: 'John Doe' })
    await createBlog(user, { title: 'Node.js Guide', author: 'Jamie Smith' })

    const titleMatch = await request(app)
      .get('/api/blogs?search=ct.js')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const authorMatch = await request(app)
      .get('/api/blogs?search=ith')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(titleMatch.body.length).toBe(1)
    expect(authorMatch.body.length).toBe(1)
  })

  test('Test 11h: A blog matching both fields is returned only once', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'React by Jamie', author: 'Jamie Smith' })

    const response = await request(app)
      .get('/api/blogs?search=jamie')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(1)
  })

  test('Test 11i: GET /api/blogs still returns all blogs without search', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe' })
    await createBlog(user, { title: 'Node.js Guide', author: 'Jane Smith' })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(2)
  })

  test('Test 11j: Empty search parameter returns all blogs', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe' })
    await createBlog(user, { title: 'Node.js Guide', author: 'Jane Smith' })

    const response = await request(app)
      .get('/api/blogs?search=')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(2)
  })

  test('Test 11k: Search results include associated user information', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe' })

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

  // Exercise 15: Ordering by likes descending
  test('Test 12a: Blogs are returned in descending order of likes', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Low Likes', author: 'Author A', likes: 2 })
    await createBlog(user, { title: 'Medium Likes', author: 'Author B', likes: 15 })
    await createBlog(user, { title: 'High Likes', author: 'Author C', likes: 25 })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(3)
    expect(response.body[0].title).toBe('High Likes')
    expect(response.body[1].title).toBe('Medium Likes')
    expect(response.body[2].title).toBe('Low Likes')
  })

  test('Test 12b: Blog with more likes appears before blog with fewer likes', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'First', author: 'Author A', likes: 10 })
    await createBlog(user, { title: 'Second', author: 'Author B', likes: 5 })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body[0].likes).toBeGreaterThan(response.body[1].likes)
    expect(response.body[0].title).toBe('First')
    expect(response.body[1].title).toBe('Second')
  })

  test('Test 12c: Blog with highest likes appears first', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'One', author: 'Author A', likes: 1 })
    await createBlog(user, { title: 'Two', author: 'Author B', likes: 100 })
    await createBlog(user, { title: 'Three', author: 'Author C', likes: 50 })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body[0].title).toBe('Two')
    expect(response.body[0].likes).toBe(100)
  })

  test('Test 12d: Blog with lowest likes appears last', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'One', author: 'Author A', likes: 100 })
    await createBlog(user, { title: 'Two', author: 'Author B', likes: 50 })
    await createBlog(user, { title: 'Three', author: 'Author C', likes: 1 })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    const lastIndex = response.body.length - 1
    expect(response.body[lastIndex].title).toBe('Three')
    expect(response.body[lastIndex].likes).toBe(1)
  })

  test('Test 12e: Ordering works when searching by title', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'React Basics', author: 'Author A', likes: 5 })
    await createBlog(user, { title: 'React Advanced', author: 'Author B', likes: 20 })
    await createBlog(user, { title: 'Node.js Intro', author: 'Author C', likes: 10 })

    const response = await request(app)
      .get('/api/blogs?search=react')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(2)
    expect(response.body[0].title).toBe('React Advanced')
    expect(response.body[1].title).toBe('React Basics')
    expect(response.body[0].likes).toBeGreaterThan(response.body[1].likes)
  })

  test('Test 12f: Ordering works when searching by author', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog A', author: 'John Smith', likes: 5 })
    await createBlog(user, { title: 'Blog B', author: 'John Smith', likes: 20 })
    await createBlog(user, { title: 'Blog C', author: 'Jane Doe', likes: 10 })

    const response = await request(app)
      .get('/api/blogs?search=john')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(2)
    expect(response.body[0].title).toBe('Blog B')
    expect(response.body[1].title).toBe('Blog A')
    expect(response.body[0].likes).toBeGreaterThan(response.body[1].likes)
  })

  test('Test 12g: Ordering with zero likes blogs', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Zero Likes', author: 'Author A', likes: 0 })
    await createBlog(user, { title: 'Some Likes', author: 'Author B', likes: 10 })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body[0].title).toBe('Some Likes')
    expect(response.body[1].title).toBe('Zero Likes')
  })

  test('Test 12h: Search results include associated user information with ordering', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Learning React', author: 'John Doe', likes: 10 })

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

  test('Test 12i: Ordering preserves all blogs regardless of like count', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog 1', author: 'Author A', likes: 0 })
    await createBlog(user, { title: 'Blog 2', author: 'Author B', likes: 50 })
    await createBlog(user, { title: 'Blog 3', author: 'Author C', likes: 25 })
    await createBlog(user, { title: 'Blog 4', author: 'Author D', likes: 100 })

    const response = await request(app)
      .get('/api/blogs')
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(response.body.length).toBe(4)
    expect(response.body[0].likes).toBe(100)
    expect(response.body[1].likes).toBe(50)
    expect(response.body[2].likes).toBe(25)
    expect(response.body[3].likes).toBe(0)
  })

  // Exercise 16: Authors aggregation
  test('Test 13a: GET /api/authors returns HTTP 200', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog 1', author: 'Author A', likes: 10 })
    await createBlog(user, { title: 'Blog 2', author: 'Author A', likes: 20 })
    await createBlog(user, { title: 'Blog 3', author: 'Author B', likes: 5 })

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    expect(Array.isArray(response.body)).toBe(true)
  })

  test('Test 13b: Response has correct structure (author, blogs, likes)', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog 1', author: 'Author A', likes: 10 })
    await createBlog(user, { title: 'Blog 2', author: 'Author A', likes: 20 })

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    expect(response.body[0]).toHaveProperty('author')
    expect(response.body[0]).toHaveProperty('blogs')
    expect(response.body[0]).toHaveProperty('likes')
  })

  test('Test 13c: Blog count is correct for author with multiple blogs', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog 1', author: 'Author A', likes: 10 })
    await createBlog(user, { title: 'Blog 2', author: 'Author A', likes: 20 })

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    const authorA = response.body.find(a => a.author === 'Author A')
    expect(authorA).toBeDefined()
    expect(authorA.blogs).toBe('2')
  })

  test('Test 13d: Total likes are correctly calculated across author blogs', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog 1', author: 'Author A', likes: 10 })
    await createBlog(user, { title: 'Blog 2', author: 'Author A', likes: 20 })

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    const authorA = response.body.find(a => a.author === 'Author A')
    expect(authorA).toBeDefined()
    expect(authorA.likes).toBe('30')
  })

  test('Test 13d2: Separate grouping for different authors', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog A', author: 'Author A', likes: 10 })
    await createBlog(user, { title: 'Blog B', author: 'Author B', likes: 20 })

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    const authors = response.body
    expect(authors.length).toBe(2)
    const authorA = authors.find(a => a.author === 'Author A')
    const authorB = authors.find(a => a.author === 'Author B')
    expect(authorA).toBeDefined()
    expect(authorB).toBeDefined()
    expect(authorA.blogs).toBe('1')
    expect(authorB.blogs).toBe('1')
  })

  test('Test 13e: Author with zero likes is handled correctly', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog A', author: 'Author A', likes: 0 })

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    const authorA = response.body.find(a => a.author === 'Author A')
    expect(authorA).toBeDefined()
    expect(authorA.blogs).toBe('1')
    expect(authorA.likes).toBe('0')
  })

  test('Test 13f: Empty array when there are no blogs', async () => {
    const { user, token } = await createUserAndToken()

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBe(0)
  })

  test('Test 13g: Results ordered by total likes descending (bonus)', async () => {
    const { user, token } = await createUserAndToken()
    await createBlog(user, { title: 'Blog A', author: 'Author A', likes: 5 })
    await createBlog(user, { title: 'Blog B', author: 'Author B', likes: 20 })
    await createBlog(user, { title: 'Blog C', author: 'Author C', likes: 10 })

    const response = await request(app)
      .get('/api/authors')
      .expect(200)

    expect(response.body[0].author).toBe('Author B')
    expect(response.body[0].likes).toBe('20')
    expect(response.body[1].author).toBe('Author C')
    expect(response.body[1].likes).toBe('10')
    expect(response.body[2].author).toBe('Author A')
    expect(response.body[2].likes).toBe('5')
  })
})