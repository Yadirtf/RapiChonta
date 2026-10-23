// Mueve los issues entre estados según lo que pasa en GitHub.
//
//   Issue abierto desde plantilla → etiquetas de área, fase y prioridad, estado backlog
//                                   y enlace como sub-issue de la épica o historia indicada
//   Etiqueta estado:* agregada     → se quitan las demás etiquetas de estado
//   Issue asignado                 → en progreso (si estaba en backlog o listo)
//   Sin asignados                  → listo (si estaba en progreso)
//   PR borrador que lo cierra      → en progreso
//   PR listo para revisión         → en revisión
//   PR integrado (a develop o main)→ issue cerrado como completado y hecho
//   PR cerrado sin integrar        → vuelve a en progreso
//   Issue cerrado                  → hecho; si todas las historias de la épica
//                                    están cerradas, la épica se cierra
//   Issue reabierto                → en progreso o backlog; reabre la épica si estaba cerrada
//
// Devuelve (output "issues") los números tocados para sincronizar el tablero.
const {
  TIPO, ESTADO, ESTADOS, MARCA_PROGRESO, RE_BACKLOG_ID,
  issuesQueCierra, leerFormulario, nombresEtiquetas, tiene, subIssues, padreDe, enlazarSubIssue, cuerpoEpicaConHistorias,
} = require('./lib');

const ACTIVOS = [ESTADO.progreso, ESTADO.revision];

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const tocados = new Set();
  const api = { github, owner, repo, core, tocados };

  if (context.eventName === 'issues') {
    await alEventoDeIssue(api, context.payload);
  } else if (context.eventName === 'pull_request' || context.eventName === 'pull_request_target') {
    await alEventoDePR(api, context.payload);
  }
  core.setOutput('issues', [...tocados].join(','));
};

// ── Estados ──────────────────────────────────────────────────────────────────
async function leerIssue({ github, owner, repo }, numero) {
  const { data } = await github.rest.issues.get({ owner, repo, issue_number: numero });
  return data;
}

async function ponerEstado(api, issue, estado) {
  const { github, owner, repo, core, tocados } = api;
  const actuales = nombresEtiquetas(issue);
  for (const otro of actuales.filter((n) => ESTADOS.includes(n) && n !== estado)) {
    try {
      await github.rest.issues.removeLabel({ owner, repo, issue_number: issue.number, name: otro });
    } catch (e) { /* ya no estaba */ }
  }
  if (estado && !actuales.includes(estado)) {
    await github.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels: [estado] });
  }
  issue.labels = [...actuales.filter((n) => !ESTADOS.includes(n)), ...(estado ? [estado] : [])].map((name) => ({ name }));
  tocados.add(issue.number);
  core.info(`#${issue.number} → ${estado || 'sin estado'}`);

  // La épica (o historia) padre pasa a "en progreso" cuando una hija empieza.
  if (ACTIVOS.includes(estado)) {
    const padre = await padreDe(github, owner, repo, issue);
    if (padre && padre.state === 'open') {
      const ep = nombresEtiquetas(padre).find((n) => ESTADOS.includes(n)) || ESTADO.backlog;
      if ([ESTADO.backlog, ESTADO.listo].includes(ep)) await ponerEstado(api, padre, ESTADO.progreso);
    }
  }
}

const estadoActual = (issue) => nombresEtiquetas(issue).find((n) => ESTADOS.includes(n)) || null;

// Cierra la épica (o historia) padre cuando todas sus hijas están cerradas.
async function revisarPadreAlCerrar(api, issue) {
  const { github, owner, repo } = api;
  const padre = await padreDe(github, owner, repo, issue);
  if (!padre || padre.state !== 'open') return;
  const hijos = await subIssues(github, owner, repo, padre.number);
  if (hijos.length === 0 || hijos.some((h) => h.state === 'open' && h.number !== issue.number)) return;
  const completadas = hijos.filter((h) => h.state_reason !== 'not_planned' || h.number === issue.number).length;
  // Solo comenta quien lo cerró: varias historias se cierran a la vez al integrar un PR que cierra varias.
  if (await cerrar(api, padre.number)) {
    await github.rest.issues.createComment({
      owner, repo, issue_number: padre.number,
      body: `Todas las historias de este issue están cerradas (${completadas} completadas de ${hijos.length}). Se cierra automáticamente.`,
    });
  }
  padre.state = 'closed';
  await ponerEstado(api, padre, ESTADO.hecho);
}

// Cierra el issue como completado. Devuelve false si otra ejecución lo cerró al mismo tiempo: al integrar un PR que
// cierra varias historias corren a la vez la del PR, la de cada historia cerrada y el cierre propio de GitHub
// ("Closes #N"), y GitHub rechaza la segunda con 422 "closed by another request".
async function cerrar({ github, owner, repo }, numero) {
  try {
    await github.rest.issues.update({ owner, repo, issue_number: numero, state: 'closed', state_reason: 'completed' });
    return true;
  } catch (e) {
    if (e.status === 422 && /closed by another request/i.test(e.message || '')) return false;
    throw e;
  }
}

async function reabrirPadre(api, issue) {
  const { github, owner, repo } = api;
  const padre = await padreDe(github, owner, repo, issue);
  if (!padre || padre.state !== 'closed') return;
  await github.rest.issues.update({ owner, repo, issue_number: padre.number, state: 'open' });
  padre.state = 'open';
  await ponerEstado(api, padre, ESTADO.progreso);
}

// ── Issues ───────────────────────────────────────────────────────────────────
async function alEventoDeIssue(api, payload) {
  const { action } = payload;
  const issue = payload.issue;
  if ((issue.body || '').includes(MARCA_PROGRESO)) return;

  if (action === 'opened') return alAbrir(api, issue);

  if (action === 'labeled') {
    const label = payload.label && payload.label.name;
    if (ESTADOS.includes(label) && issue.state === 'open') {
      const otros = nombresEtiquetas(issue).filter((n) => ESTADOS.includes(n) && n !== label);
      if (otros.length) await ponerEstado(api, issue, label);
    }
    return;
  }

  if (action === 'assigned') {
    if (issue.state === 'open' && [null, ESTADO.backlog, ESTADO.listo].includes(estadoActual(issue))) {
      await ponerEstado(api, issue, ESTADO.progreso);
    }
    return;
  }

  if (action === 'unassigned') {
    if (issue.state === 'open' && (issue.assignees || []).length === 0 && estadoActual(issue) === ESTADO.progreso) {
      await ponerEstado(api, issue, ESTADO.listo);
    }
    return;
  }

  if (action === 'closed') {
    await ponerEstado(api, issue, issue.state_reason === 'not_planned' ? null : ESTADO.hecho);
    await revisarPadreAlCerrar(api, issue);
    return;
  }

  if (action === 'reopened') {
    await ponerEstado(api, issue, (issue.assignees || []).length ? ESTADO.progreso : ESTADO.backlog);
    await reabrirPadre(api, issue);
  }
}

// Issue creado desde una plantilla: etiquetas desde los campos y enlace al padre.
async function alAbrir(api, issue) {
  const { github, owner, repo, core, tocados } = api;
  tocados.add(issue.number);
  if (RE_BACKLOG_ID.test(issue.body || '')) return; // lo creó el flujo Backlog

  const f = leerFormulario(issue.body);
  const etiquetas = new Set();
  for (const area of (f['Áreas'] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)) {
    if (['api', 'web', 'app', 'docs', 'infra'].includes(area)) etiquetas.add(`área: ${area}`);
  }
  const fase = /(\d)/.exec(f['Fase'] || '');
  if (fase) etiquetas.add(`fase: ${fase[1]}`);
  const prioridad = (f['Prioridad'] || '').trim().toLowerCase();
  if (['alta', 'media', 'baja'].includes(prioridad)) etiquetas.add(`prioridad: ${prioridad}`);
  if (!estadoActual(issue)) etiquetas.add(ESTADO.backlog);
  if (etiquetas.size) {
    await github.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels: [...etiquetas] });
  }

  const padreTexto = f['Épica'] || f['Pertenece a'] || '';
  const m = /#(\d+)/.exec(padreTexto);
  if (!m) return;
  const numeroPadre = Number(m[1]);
  let padre;
  try {
    padre = await leerIssue(api, numeroPadre);
  } catch (e) {
    core.warning(`#${issue.number}: el padre #${numeroPadre} no existe`);
    return;
  }
  if (padre.pull_request) return;
  if (await enlazarSubIssue(github, owner, repo, numeroPadre, issue, core)) {
    tocados.add(numeroPadre);
    if (tiene(padre, TIPO.epica)) {
      const cuerpo = cuerpoEpicaConHistorias(padre.body || '', [{ numero: issue.number }]);
      if (cuerpo !== padre.body) await github.rest.issues.update({ owner, repo, issue_number: numeroPadre, body: cuerpo });
    }
  }
}

// ── Pull requests ────────────────────────────────────────────────────────────
async function alEventoDePR(api, payload) {
  const { github, owner, repo, core } = api;
  const pr = payload.pull_request;
  const { action } = payload;
  if (action === 'edited' && !(payload.changes && (payload.changes.body || payload.changes.title))) return;

  const numeros = issuesQueCierra({ title: pr.title, body: pr.body, head: pr.head && pr.head.ref });
  if (numeros.length === 0) {
    core.info(`PR #${pr.number} no cierra ningún issue.`);
    return;
  }

  for (const n of numeros) {
    let issue;
    try {
      issue = await leerIssue(api, n);
    } catch (e) {
      core.warning(`PR #${pr.number}: #${n} no existe`);
      continue;
    }
    if (issue.pull_request || tiene(issue, TIPO.epica)) continue;

    if (action === 'closed' && pr.merged) {
      if (issue.state === 'open') {
        await github.rest.issues.createComment({
          owner, repo, issue_number: n,
          body: `Completado en #${pr.number}, integrado en \`${pr.base.ref}\`.`,
        });
        await cerrar(api, n);
        issue.state = 'closed';
      }
      await ponerEstado(api, issue, ESTADO.hecho);
      await revisarPadreAlCerrar(api, issue);
    } else if (action === 'closed') {
      if (issue.state === 'open' && estadoActual(issue) === ESTADO.revision) await ponerEstado(api, issue, ESTADO.progreso);
    } else if (issue.state === 'open') {
      const objetivo = pr.draft ? ESTADO.progreso : ESTADO.revision;
      if (estadoActual(issue) !== objetivo) await ponerEstado(api, issue, objetivo);
    }
  }
}
