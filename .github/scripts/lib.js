// Utilidades compartidas por los scripts del flujo de trabajo (GitHub Actions).
// Ver Docs/12-flujo-de-trabajo.md.
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..', '..');

const TIPO = {
  epica: 'tipo: épica',
  historia: 'tipo: historia',
  tarea: 'tipo: tarea',
  bug: 'tipo: bug',
};

const ESTADO = {
  backlog: 'estado: backlog',
  listo: 'estado: listo',
  progreso: 'estado: en progreso',
  revision: 'estado: en revisión',
  bloqueado: 'estado: bloqueado',
  hecho: 'estado: hecho',
};
const ESTADOS = Object.values(ESTADO);

const FASES = {
  1: 'Catálogo y pedido del cliente',
  2: 'Operación del domiciliario y piloto',
  3: 'Publicación y tiempo real',
  4: 'Pagos y crecimiento',
  5: 'Comercios aliados',
};
const AREAS = ['api', 'web', 'app', 'docs', 'infra'];
const PRIORIDADES = ['alta', 'media', 'baja'];

const MARCA_PROGRESO = '<!-- rapichonta:progreso -->';
const MARCA_HISTORIAS_INICIO = '<!-- historias:inicio -->';
const MARCA_HISTORIAS_FIN = '<!-- historias:fin -->';
const RE_BACKLOG_ID = /<!-- backlog-id: (\S+) -->/;
const RE_EPICA_EN_CUERPO = /\*\*Épica:\*\*\s*#(\d+)/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function leerYaml(rel, root = ROOT) {
  return yaml.load(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function cargarBacklog(root = ROOT) {
  const requerimientos = leerYaml('backlog/requerimientos.yml', root) || {};
  const { epicas = [] } = leerYaml('backlog/epicas.yml', root) || {};
  return { requerimientos, epicas };
}

function cargarEtiquetas(root = ROOT) {
  return leerYaml('.github/labels.yml', root) || [];
}

// ── Validación ───────────────────────────────────────────────────────────────
function validar({ requerimientos, epicas }, etiquetas) {
  const errores = [];
  const nombres = new Set(etiquetas.map((l) => l.name));
  const ids = new Set();
  const usados = new Set();
  const exigir = (cond, msg) => { if (!cond) errores.push(msg); };

  for (const [id, r] of Object.entries(requerimientos)) {
    exigir(/^RN?F-\d{2}$/.test(id), `Requerimiento con id inválido: ${id}`);
    exigir(r && typeof r.texto === 'string' && r.texto.length > 10, `${id}: falta el texto`);
    exigir(r && r.fuente && fs.existsSync(path.join(ROOT, r.fuente)), `${id}: la fuente ${r && r.fuente} no existe`);
  }
  for (const label of [...Object.values(TIPO), ...ESTADOS]) {
    exigir(nombres.has(label), `Falta la etiqueta "${label}" en .github/labels.yml`);
  }

  for (const e of epicas) {
    const donde = `Épica ${e.id || '(sin id)'}`;
    exigir(/^E\d{2}$/.test(e.id || ''), `${donde}: id inválido (formato E01)`);
    exigir(!ids.has(e.id), `${donde}: id repetido`);
    ids.add(e.id);
    exigir(e.titulo, `${donde}: falta titulo`);
    exigir(FASES[e.fase], `${donde}: fase inválida ${e.fase}`);
    exigir(PRIORIDADES.includes(e.prioridad), `${donde}: prioridad inválida ${e.prioridad}`);
    exigir(e.objetivo && e.terminado, `${donde}: faltan objetivo o terminado`);
    for (const a of e.areas || []) exigir(AREAS.includes(a), `${donde}: área inválida ${a}`);
    for (const d of e.docs || []) exigir(fs.existsSync(path.join(ROOT, d)), `${donde}: no existe ${d}`);
    exigir((e.historias || []).length > 0, `${donde}: no tiene historias`);

    for (const h of e.historias || []) {
      const dh = `Historia ${h.id || '(sin id)'}`;
      exigir(new RegExp(`^H${(e.id || '').slice(1)}\\.\\d+$`).test(h.id || ''), `${dh}: id inválido, debe empezar por H${(e.id || '').slice(1)}.`);
      exigir(!ids.has(h.id), `${dh}: id repetido`);
      ids.add(h.id);
      exigir(h.titulo && h.como && h.quiero && h.para, `${dh}: faltan titulo, como, quiero o para`);
      exigir((h.areas || []).length > 0, `${dh}: sin áreas`);
      for (const a of h.areas || []) exigir(AREAS.includes(a), `${dh}: área inválida ${a}`);
      exigir(PRIORIDADES.includes(h.prioridad), `${dh}: prioridad inválida ${h.prioridad}`);
      exigir(h.fase === undefined || FASES[h.fase], `${dh}: fase inválida ${h.fase}`);
      exigir((h.criterios || []).length >= 2, `${dh}: necesita al menos 2 criterios de aceptación`);
      exigir((h.requerimientos || []).length > 0, `${dh}: no cita requerimientos`);
      for (const r of h.requerimientos || []) {
        exigir(requerimientos[r], `${dh}: el requerimiento ${r} no existe`);
        usados.add(r);
      }
    }
  }
  for (const e of epicas) {
    for (const l of [...etiquetasEpica(e), ...(e.historias || []).flatMap((h) => etiquetasHistoria(e, h))]) {
      exigir(nombres.has(l), `${e.id}: la etiqueta "${l}" no está en .github/labels.yml`);
    }
  }
  for (const id of Object.keys(requerimientos)) {
    exigir(usados.has(id), `${id}: ninguna historia lo cubre`);
  }
  for (const l of etiquetas) {
    exigir(/^[0-9A-Fa-f]{6}$/.test(l.color || ''), `Etiqueta "${l.name}": color inválido`);
    exigir((l.description || '').length <= 100, `Etiqueta "${l.name}": descripción de más de 100 caracteres`);
  }
  return errores;
}

// ── Etiquetas de una épica o historia ────────────────────────────────────────
function etiquetasEpica(e) {
  return [TIPO.epica, ESTADO.backlog, `fase: ${e.fase}`, `prioridad: ${e.prioridad}`, ...(e.areas || []).map((a) => `área: ${a}`)];
}

function etiquetasHistoria(e, h) {
  return [TIPO.historia, ESTADO.backlog, `fase: ${h.fase || e.fase}`, `prioridad: ${h.prioridad}`, ...(h.areas || []).map((a) => `área: ${a}`)];
}

// ── Cuerpos de los issues ────────────────────────────────────────────────────
const enlaceDoc = (repo, ruta) => `[${path.basename(ruta)}](https://github.com/${repo}/blob/develop/${ruta})`;

function cuerpoEpica(e, repo) {
  const fase = `Fase ${e.fase} · ${FASES[e.fase]}`;
  return [
    `<!-- backlog-id: ${e.id} -->`,
    `**${e.id}** · ${fase} · prioridad ${e.prioridad}`,
    '',
    '## Objetivo',
    e.objetivo,
    '',
    '## Terminado cuando',
    e.terminado,
    '',
    '## Documentación',
    ...(e.docs || []).map((d) => `- ${enlaceDoc(repo, d)}`),
    '',
    '## Historias',
    'Cada historia es un sub-issue de esta épica; el avance se ve en la barra de sub-issues y en el issue de progreso.',
    '',
    MARCA_HISTORIAS_INICIO,
    MARCA_HISTORIAS_FIN,
  ].join('\n');
}

function cuerpoHistoria(e, h, requerimientos, repo, numeroEpica) {
  const fase = h.fase || e.fase;
  const lineas = [
    `<!-- backlog-id: ${h.id} -->`,
    `**Épica:** #${numeroEpica} · ${e.id} ${e.titulo} · Fase ${fase} · prioridad ${h.prioridad}`,
    '',
    '## Historia',
    `**Como** ${h.como}, **quiero** ${h.quiero}, **para** ${h.para}.`,
    '',
    '## Criterios de aceptación',
    ...h.criterios.map((c) => `- [ ] ${c}`),
    '',
    '## Requerimientos',
    ...h.requerimientos.map((id) => {
      const r = requerimientos[id];
      return `- **${id}** ${r.texto} (${enlaceDoc(repo, r.fuente)})`;
    }),
  ];
  if (h.notas) lineas.push('', '## Notas', h.notas);
  lineas.push(
    '',
    '## Definición de terminado',
    '- [ ] Se cumplen todos los criterios de aceptación.',
    '- [ ] Los casos de uso nuevos tienen pruebas unitarias y el dominio se prueba sin base de datos.',
    '- [ ] Los textos visibles están en español e inglés (archivos JSON/ARB).',
    '- [ ] `Docs/` está actualizado si cambió una decisión.',
    '- [ ] El PR a `develop` dice `Closes #<este issue>` y el CI está en verde.',
  );
  return lineas.join('\n');
}

// Inserta en el cuerpo de la épica las historias que falten, entre las marcas.
function cuerpoEpicaConHistorias(cuerpo, historias) {
  const ini = cuerpo.indexOf(MARCA_HISTORIAS_INICIO);
  const fin = cuerpo.indexOf(MARCA_HISTORIAS_FIN);
  if (ini < 0 || fin < ini) return cuerpo; // alguien editó las marcas: no se toca
  const actual = cuerpo.slice(ini + MARCA_HISTORIAS_INICIO.length, fin);
  const nuevas = historias.filter(({ numero }) => !new RegExp(`#${numero}\\b`).test(actual));
  if (nuevas.length === 0) return cuerpo;
  const lineas = actual.split('\n').filter((l) => l.trim());
  for (const { numero } of nuevas) lineas.push(`- #${numero}`);
  return cuerpo.slice(0, ini + MARCA_HISTORIAS_INICIO.length) + '\n' + lineas.join('\n') + '\n' + cuerpo.slice(fin);
}

// ── Documento de requerimientos (Docs/13-requerimientos.md) ──────────────────
function documentoRequerimientos({ requerimientos, epicas }) {
  const cubre = {};
  for (const e of epicas) for (const h of e.historias) for (const r of h.requerimientos) {
    (cubre[r] = cubre[r] || []).push(h.id);
  }
  const fila = (id) => {
    const r = requerimientos[id];
    const fuente = `[${path.basename(r.fuente, '.md')}](${path.basename(r.fuente)})`;
    return `| ${id} | ${r.texto.replace(/\|/g, '\\|')} | ${fuente} | ${(cubre[id] || []).join(', ')} |`;
  };
  const ids = Object.keys(requerimientos);
  const tabla = (filtro) => ['| Id | Requerimiento | Fuente | Historias |', '| --- | --- | --- | --- |', ...ids.filter(filtro).map(fila)];

  const out = [
    '# 13 · Requerimientos y backlog',
    '',
    '<!-- Archivo generado desde backlog/*.yml con `node .github/scripts/cli.js docs`. No editar a mano. -->',
    '',
    'Este documento se genera desde [`backlog/requerimientos.yml`](../backlog/requerimientos.yml) y [`backlog/epicas.yml`](../backlog/epicas.yml). Cada historia es un issue en GitHub; el flujo que los crea y los mueve está en [12 · Flujo de trabajo](12-flujo-de-trabajo.md).',
    '',
    '## Épicas e historias',
    '',
  ];
  for (const fase of Object.keys(FASES)) {
    const delaFase = epicas.filter((e) => String(e.fase) === fase);
    if (!delaFase.length) continue;
    out.push(`### Fase ${fase} · ${FASES[fase]}`, '');
    for (const e of delaFase) {
      out.push(`**${e.id} · ${e.titulo}** (prioridad ${e.prioridad}). ${e.objetivo}`, '');
      out.push('| Historia | Como… quiero… | Áreas | Prioridad | Requerimientos |', '| --- | --- | --- | --- | --- |');
      for (const h of e.historias) {
        const fase2 = h.fase && h.fase !== e.fase ? ` (fase ${h.fase})` : '';
        out.push(`| ${h.id} · ${h.titulo}${fase2} | Como ${h.como}, quiero ${h.quiero} | ${h.areas.join(', ')} | ${h.prioridad} | ${h.requerimientos.join(', ')} |`);
      }
      out.push('');
    }
  }
  out.push('## Requerimientos funcionales', '', ...tabla((id) => id.startsWith('RF-')), '');
  out.push('## Requerimientos no funcionales', '', ...tabla((id) => id.startsWith('RNF-')), '');
  return out.join('\n');
}

// ── Lectura de PRs e issues ──────────────────────────────────────────────────
// Issues que un PR cierra: palabras clave de GitHub (y en español) más el número
// al inicio de la rama, por ejemplo feature/23-carrito.
function issuesQueCierra({ title = '', body = '', head = '' }) {
  const numeros = new Set();
  const re = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|cierra|cierran|resuelve|resuelven|soluciona)\b\s*:?\s*((?:#\d+(?:\s*(?:,|y|and)\s*)?)+)/gi;
  for (const m of `${title}\n${body || ''}`.matchAll(re)) {
    for (const n of m[1].matchAll(/#(\d+)/g)) numeros.add(Number(n[1]));
  }
  const rama = /^(?:feature|feat|fix|bugfix|hotfix|chore|docs|claude)\/(\d+)(?:[-_]|$)/.exec(head || '');
  if (rama) numeros.add(Number(rama[1]));
  return [...numeros];
}

// Convierte el cuerpo de un formulario de issue en { encabezado: valor }.
function leerFormulario(body = '') {
  const campos = {};
  const partes = (body || '').split(/^### /m).slice(1);
  for (const parte of partes) {
    const [titulo, ...resto] = parte.split('\n');
    const valor = resto.join('\n').trim();
    campos[titulo.trim()] = valor === '_No response_' ? '' : valor;
  }
  return campos;
}

function estadoDe(issue) {
  const nombres = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  if (issue.state === 'closed') return issue.state_reason === 'not_planned' ? null : ESTADO.hecho;
  return nombres.find((n) => ESTADOS.includes(n)) || ESTADO.backlog;
}

const nombresEtiquetas = (issue) => (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
const tiene = (issue, label) => nombresEtiquetas(issue).includes(label);

async function todosLosIssues(github, owner, repo) {
  const issues = await github.paginate(github.rest.issues.listForRepo, { owner, repo, state: 'all', per_page: 100 });
  return issues.filter((i) => !i.pull_request);
}

async function subIssues(github, owner, repo, numero) {
  try {
    return await github.paginate('GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
      owner, repo, issue_number: numero, per_page: 100,
    });
  } catch (e) {
    return [];
  }
}

// Épica (o historia) padre de un issue: API de sub-issues o, si no, la línea **Épica:** #N.
async function padreDe(github, owner, repo, issue) {
  try {
    const { data } = await github.request('GET /repos/{owner}/{repo}/issues/{issue_number}/parent', {
      owner, repo, issue_number: issue.number,
    });
    if (data && data.number) return data;
  } catch (e) { /* sin padre o API no disponible */ }
  const m = RE_EPICA_EN_CUERPO.exec(issue.body || '');
  if (!m) return null;
  try {
    const { data } = await github.rest.issues.get({ owner, repo, issue_number: Number(m[1]) });
    return data.pull_request ? null : data;
  } catch (e) {
    return null;
  }
}

async function enlazarSubIssue(github, owner, repo, padre, hijo, core) {
  try {
    await github.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
      owner, repo, issue_number: padre, sub_issue_id: hijo.id,
    });
    return true;
  } catch (e) {
    if (core) core.warning(`No se pudo enlazar #${hijo.number} como sub-issue de #${padre}: ${e.message}`);
    return false;
  }
}

module.exports = {
  ROOT, TIPO, ESTADO, ESTADOS, FASES, AREAS, PRIORIDADES,
  MARCA_PROGRESO, RE_BACKLOG_ID, RE_EPICA_EN_CUERPO,
  sleep, cargarBacklog, cargarEtiquetas, validar,
  etiquetasEpica, etiquetasHistoria, cuerpoEpica, cuerpoHistoria, cuerpoEpicaConHistorias,
  documentoRequerimientos, issuesQueCierra, leerFormulario, estadoDe, nombresEtiquetas, tiene,
  todosLosIssues, subIssues, padreDe, enlazarSubIssue,
};
