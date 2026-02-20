import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,       // IP ou localhost
  port: process.env.DB_PORT,       // 5432
  user: process.env.DB_USER,       // postgres ou outro
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

export default pool;
