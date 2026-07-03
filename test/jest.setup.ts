process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://test_user:test_password@localhost:5432/test_db?schema=public';
