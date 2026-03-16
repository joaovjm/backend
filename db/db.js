import pkg from "pg";
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,       // IP ou localhost
  port: process.env.DB_PORT,       // 5432
  user: process.env.DB_USER,       // postgres ou outro
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 50,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  maxUses: 7500,
});
pool.on("error", (err) => {console.log("Erro inesperado no pool", err)});

export default pool;
