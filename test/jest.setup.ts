process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://test_user:test_password@localhost:5432/test_db_test?schema=public';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'test-only-signing-key-not-for-production';
