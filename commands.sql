CREATE DATABASE blogs;

CREATE TABLE blogs (
    id SERIAL PRIMARY KEY,
    author TEXT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    likes INTEGER DEFAULT 0
);

INSERT INTO blogs (author, url, title, likes)
VALUES
('Samuel Asongo', 'https://example.com/blog1', 'Learning PostgreSQL', 5),
('John Doe', 'https://example.com/blog2', 'Introduction to Databases', 3);