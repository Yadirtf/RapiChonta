#!/usr/bin/env node
// Uso local y en CI:
//   node .github/scripts/cli.js validar   valida backlog/*.yml y que Docs/13 esté al día
//   node .github/scripts/cli.js docs      regenera Docs/13-requerimientos.md
const fs = require('fs');
const path = require('path');
const { ROOT, cargarBacklog, cargarEtiquetas, validar, documentoRequerimientos } = require('./lib');

const DOC = path.join(ROOT, 'Docs', '13-requerimientos.md');
const comando = process.argv[2];
const backlog = cargarBacklog();

if (comando === 'docs') {
  fs.writeFileSync(DOC, documentoRequerimientos(backlog));
  console.log(`Escrito ${path.relative(ROOT, DOC)}`);
} else if (comando === 'validar') {
  const errores = validar(backlog, cargarEtiquetas());
  const esperado = documentoRequerimientos(backlog);
  if (!fs.existsSync(DOC) || fs.readFileSync(DOC, 'utf8') !== esperado) {
    errores.push('Docs/13-requerimientos.md no está al día: ejecute `node .github/scripts/cli.js docs` y suba el cambio.');
  }
  if (errores.length) {
    for (const e of errores) console.log(`::error::${e}`);
    process.exit(1);
  }
  const historias = backlog.epicas.reduce((n, e) => n + e.historias.length, 0);
  console.log(`Backlog válido: ${backlog.epicas.length} épicas, ${historias} historias, ${Object.keys(backlog.requerimientos).length} requerimientos.`);
} else {
  console.log('Uso: node .github/scripts/cli.js <validar|docs>');
  process.exit(2);
}
