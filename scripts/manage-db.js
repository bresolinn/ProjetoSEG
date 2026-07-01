#!/usr/bin/env node
// scripts/manage-db.js
//
// Script de linha de comando para preencher a tabela "registros" manualmente,
// como pedido no trabalho (ID / STATUS / CHAVE).
//
// USO:
//   node scripts/manage-db.js add <ID> <locked|unlocked> <CHAVE>
//   node scripts/manage-db.js list
//   node scripts/manage-db.js set-status <ID> <locked|unlocked>
//   node scripts/manage-db.js remove <ID>
//
// Exemplos:
//   node scripts/manage-db.js add VITIMA-001 locked 9F3C-AA12-77E0-B4D1-DEMO-KEY-001
//   node scripts/manage-db.js list
//   node scripts/manage-db.js set-status VITIMA-001 unlocked
//   node scripts/manage-db.js remove VITIMA-001

require("dotenv").config();
const { pool, initDb } = require("../db");

function uso() {
  console.log(`
Uso:
  node scripts/manage-db.js add <ID> <locked|unlocked> <CHAVE>
  node scripts/manage-db.js list
  node scripts/manage-db.js set-status <ID> <locked|unlocked>
  node scripts/manage-db.js remove <ID>
`);
}

async function add(id, status, chave) {
  if (!id || !status || !chave) return uso();
  if (!["locked", "unlocked"].includes(status)) {
    console.log('Status inválido. Use "locked" ou "unlocked".');
    return;
  }
  await pool.query(
    `INSERT INTO registros (id, status, chave)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET status = $2, chave = $3`,
    [id.toUpperCase(), status, chave]
  );
  console.log(`Registro ${id.toUpperCase()} salvo com status "${status}".`);
}

async function list() {
  const { rows } = await pool.query("SELECT id, status, chave FROM registros ORDER BY id");
  if (rows.length === 0) {
    console.log("Nenhum registro cadastrado ainda.");
    return;
  }
  console.table(rows);
}

async function setStatus(id, status) {
  if (!id || !status) return uso();
  if (!["locked", "unlocked"].includes(status)) {
    console.log('Status inválido. Use "locked" ou "unlocked".');
    return;
  }
  const { rowCount } = await pool.query(
    "UPDATE registros SET status = $2 WHERE id = $1",
    [id.toUpperCase(), status]
  );
  console.log(
    rowCount > 0
      ? `Status de ${id.toUpperCase()} atualizado para "${status}".`
      : `ID ${id.toUpperCase()} não encontrado.`
  );
}

async function remove(id) {
  if (!id) return uso();
  const { rowCount } = await pool.query("DELETE FROM registros WHERE id = $1", [id.toUpperCase()]);
  console.log(rowCount > 0 ? `Registro ${id.toUpperCase()} removido.` : `ID ${id.toUpperCase()} não encontrado.`);
}

async function main() {
  await initDb();
  const [, , comando, ...args] = process.argv;

  switch (comando) {
    case "add":
      await add(args[0], args[1], args[2]);
      break;
    case "list":
      await list();
      break;
    case "set-status":
      await setStatus(args[0], args[1]);
      break;
    case "remove":
      await remove(args[0]);
      break;
    default:
      uso();
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Erro:", err.message);
  process.exit(1);
});
