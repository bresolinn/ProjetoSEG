// server.js - VERSÃO FINAL
// API da demonstração "Ameaça Digital" com confirmação MANUAL de pagamentos
//
// Endpoints:
//   GET  /                                  -> redireciona para index.html
//   GET  /api/registros/:id                 -> status e carteira
//   POST /api/payment-notified/:id          -> usuário notifica que pagou
//   POST /api/payment-check/:id             -> verifica status da confirmação
//   GET  /s3cr3t-4dm1n-p4n3l/login          -> tela de login do admin
//   POST /api/admin/auth                    -> autenticar admin
//   GET  /api/admin/registros               -> listar todos os registros (requer auth)
//   GET  /api/admin/pending                 -> listar pagamentos pendentes (requer auth)
//   POST /api/admin/create                  -> criar novo registro (requer auth)
//   DELETE /api/admin/delete/:id            -> deletar registro (requer auth)
//   POST /api/admin/confirm/:id             -> confirmar pagamento (requer auth)
//   POST /api/admin/deny/:id                -> negar pagamento (requer auth)

const express = require("express");
const path = require("path");
const { pool, initDb } = require("./db");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Armazenar sessões de admin em memória (em produção usar session store)
const adminSessions = new Map();
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "test123";

// Middleware para verificar autenticação do admin
function checkAdminAuth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: "Não autorizado" });
  }
  req.adminId = token;
  next();
}

// ============================================
// GET / (redirecionar para index.html)
// ============================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ============================================
// GET /s3cr3t-4dm1n-p4n3l/login (rota secreta)
// ============================================
app.get("/s3cr3t-4dm1n-p4n3l/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ============================================
// GET /api/registros/:id
// ============================================
app.get("/api/registros/:id", async (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  try {
    const { rows } = await pool.query(
      "SELECT id, status, chave FROM registros WHERE id = $1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ found: false });
    }

    const registro = rows[0];

    // Se já está desbloqueado, retorna a chave
    if (registro.status === "unlocked") {
      return res.json({
        found: true,
        status: "unlocked",
        chave: registro.chave,
      });
    }

    // Se está bloqueado, retorna instrução e carteira admin
    return res.json({
      found: true,
      status: "locked",
      carteira_admin: "0x" + "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
      instrucao: "Envie uma criptomoeda para a carteira acima e clique em 'Eu já paguei'",
    });
  } catch (err) {
    console.error("Erro no GET /api/registros/:id:", err);
    return res.status(500).json({ error: "Erro ao buscar registro" });
  }
});

// ============================================
// POST /api/payment-notified/:id
// ============================================
app.post("/api/payment-notified/:id", async (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  try {
    const { rows: registros } = await pool.query(
      "SELECT id, status FROM registros WHERE id = $1",
      [id]
    );

    if (registros.length === 0) {
      return res.status(404).json({ found: false });
    }

    if (registros[0].status === "unlocked") {
      return res.status(400).json({ error: "Já desbloqueado" });
    }

    await pool.query(
      `INSERT INTO payment_requests (user_id, status) 
       VALUES ($1, 'pending') 
       ON CONFLICT (user_id) DO UPDATE SET status = 'pending', notificado_em = NOW()`,
      [id]
    );

    return res.json({ success: true, message: "Admin foi notificado" });
  } catch (err) {
    console.error("Erro no POST /api/payment-notified/:id:", err);
    return res.status(500).json({ error: "Erro ao notificar" });
  }
});

// ============================================
// POST /api/payment-check/:id
// ============================================
app.post("/api/payment-check/:id", async (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  try {
    const { rows } = await pool.query(
      "SELECT status FROM payment_requests WHERE user_id = $1",
      [id]
    );

    if (rows.length === 0) {
      return res.json({ status: "not_notified" });
    }

    const status = rows[0].status;
    return res.json({ status });
  } catch (err) {
    console.error("Erro no POST /api/payment-check/:id:", err);
    return res.status(500).json({ error: "Erro ao verificar" });
  }
});

// ============================================
// POST /api/admin/auth
// ============================================
app.post("/api/admin/auth", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = Math.random().toString(36).substring(2, 15);
    adminSessions.set(token, { username, loginTime: Date.now() });
    return res.json({ success: true, token });
  }

  res.status(401).json({ error: "Credenciais inválidas" });
});

// ============================================
// GET /api/admin/registros
// ============================================
app.get("/api/admin/registros", checkAdminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, status, chave FROM registros ORDER BY id DESC
    `);

    return res.json({ registros: rows });
  } catch (err) {
    console.error("Erro ao listar registros:", err);
    return res.status(500).json({ error: "Erro ao listar registros" });
  }
});

// ============================================
// GET /api/admin/pending
// ============================================
app.get("/api/admin/pending", checkAdminAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        pr.user_id, 
        r.status as registro_status,
        pr.status as payment_status,
        pr.notificado_em
      FROM payment_requests pr
      JOIN registros r ON pr.user_id = r.id
      WHERE pr.status = 'pending'
      ORDER BY pr.notificado_em DESC
    `);

    return res.json({ pending: rows });
  } catch (err) {
    console.error("Erro ao listar pendentes:", err);
    return res.status(500).json({ error: "Erro ao listar" });
  }
});

// ============================================
// POST /api/admin/create
// ============================================
app.post("/api/admin/create", checkAdminAuth, async (req, res) => {
  const { id, chave } = req.body;

  if (!id || !chave) {
    return res.status(400).json({ error: "ID e chave são obrigatórios" });
  }

  try {
    const idUpper = id.trim().toUpperCase();
    
    await pool.query(
      `INSERT INTO registros (id, status, chave) 
       VALUES ($1, 'locked', $2)
       ON CONFLICT (id) DO UPDATE SET chave = $2, status = 'locked'`,
      [idUpper, chave]
    );

    return res.json({
      success: true,
      message: `Registro ${idUpper} criado com sucesso!`
    });
  } catch (err) {
    console.error("Erro ao criar registro:", err);
    return res.status(500).json({ error: "Erro ao criar registro" });
  }
});

// ============================================
// DELETE /api/admin/delete/:id
// ============================================
app.delete("/api/admin/delete/:id", checkAdminAuth, async (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  try {
    // Deletar o registro
    const { rows } = await pool.query(
      `DELETE FROM registros WHERE id = $1 RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    // Deletar pagamento_requests associado
    await pool.query(
      `DELETE FROM payment_requests WHERE user_id = $1`,
      [id]
    );

    return res.json({
      success: true,
      message: `${id} foi deletado com sucesso!`
    });
  } catch (err) {
    console.error("Erro ao deletar registro:", err);
    return res.status(500).json({ error: "Erro ao deletar registro" });
  }
});

// ============================================
// POST /api/admin/confirm/:id
// ============================================
app.post("/api/admin/confirm/:id", checkAdminAuth, async (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  try {
    const { rows: registros } = await pool.query(
      `UPDATE registros SET status = 'unlocked' WHERE id = $1 RETURNING id, chave`,
      [id]
    );

    if (registros.length === 0) {
      return res.status(404).json({ error: "Registro não encontrado" });
    }

    await pool.query(
      `UPDATE payment_requests SET status = 'confirmed', confirmado_em = NOW() WHERE user_id = $1`,
      [id]
    );

    return res.json({
      success: true,
      message: `${id} desbloqueado!`,
    });
  } catch (err) {
    console.error("Erro ao confirmar:", err);
    return res.status(500).json({ error: "Erro ao confirmar" });
  }
});

// ============================================
// POST /api/admin/deny/:id
// ============================================
app.post("/api/admin/deny/:id", checkAdminAuth, async (req, res) => {
  const id = req.params.id.trim().toUpperCase();

  try {
    await pool.query(
      `UPDATE payment_requests SET status = 'denied' WHERE user_id = $1`,
      [id]
    );

    return res.json({
      success: true,
      message: `Pagamento de ${id} negado`,
    });
  } catch (err) {
    console.error("Erro ao negar:", err);
    return res.status(500).json({ error: "Erro ao negar" });
  }
});

// ============================================
// GET /api/health
// ============================================
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ API rodando em http://localhost:${PORT}`);
      console.log(`📺 Tela de pagamento em http://localhost:${PORT}`);
      console.log(`🔐 Painel admin em http://localhost:${PORT}/s3cr3t-4dm1n-p4n3l/login`);
      console.log(`\n📋 CREDENCIAIS DE TESTE:`);
      console.log(`   Usuário: ${ADMIN_USERNAME}`);
      console.log(`   Senha: ${ADMIN_PASSWORD}`);
    });
  })
  .catch((err) => {
    console.error("❌ Erro ao conectar/preparar o banco:", err.message);
    process.exit(1);
  });

module.exports = app;
