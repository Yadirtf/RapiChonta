// Escribe el issue fijado "📊 Progreso del proyecto" con el avance por fase y por
// épica, lo que está en curso y lo bloqueado. Se reescribe en cada ejecución.
const {
  TIPO, ESTADO, FASES, MARCA_PROGRESO, RE_BACKLOG_ID, RE_EPICA_EN_CUERPO,
  estadoDe, nombresEtiquetas, tiene, todosLosIssues, subIssues,
} = require('./lib');

const TITULO = '📊 Progreso del proyecto';

const barra = (hechas, total) => {
  const llenos = total ? Math.round((hechas / total) * 10) : 0;
  return '█'.repeat(llenos) + '░'.repeat(10 - llenos);
};
const pct = (hechas, total) => (total ? Math.round((hechas * 100) / total) : 0);
const faseDe = (issue) => {
  const l = nombresEtiquetas(issue).find((n) => n.startsWith('fase: '));
  return l ? l.slice(6) : '—';
};
const ESTADO_CORTO = {
  [ESTADO.backlog]: 'backlog',
  [ESTADO.listo]: 'listo',
  [ESTADO.progreso]: 'en progreso',
  [ESTADO.revision]: 'en revisión',
  [ESTADO.bloqueado]: 'bloqueado',
  [ESTADO.hecho]: 'hecho',
};

function construirReporte({ issues, hijosPorEpica, ahora }) {
  const epicas = issues.filter((i) => tiene(i, TIPO.epica));
  const trabajo = issues.filter((i) => tiene(i, TIPO.historia) || tiene(i, TIPO.tarea));
  const bugsAbiertos = issues.filter((i) => tiene(i, TIPO.bug) && i.state === 'open');
  const cuenta = (lista) => {
    const c = { total: 0, hecho: 0, revision: 0, progreso: 0, bloqueado: 0, pendiente: 0 };
    for (const i of lista) {
      const e = estadoDe(i);
      if (e === null) continue; // cerrado como no planeado: no cuenta
      c.total++;
      if (e === ESTADO.hecho) c.hecho++;
      else if (e === ESTADO.revision) c.revision++;
      else if (e === ESTADO.progreso) c.progreso++;
      else if (e === ESTADO.bloqueado) c.bloqueado++;
      else c.pendiente++;
    }
    return c;
  };

  const total = cuenta(trabajo);
  const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' }).format(ahora);
  const out = [
    MARCA_PROGRESO,
    `_Se actualiza solo con cada cambio en los issues y PR. Última actualización: ${fecha} (hora de Colombia). No edites este issue: el flujo lo reescribe._`,
    '',
    `**${total.hecho} de ${total.total} historias y tareas hechas (${pct(total.hecho, total.total)} %)** \`${barra(total.hecho, total.total)}\``,
    '',
    `En revisión: ${total.revision} · En progreso: ${total.progreso} · Bloqueadas: ${total.bloqueado} · Pendientes: ${total.pendiente} · Bugs abiertos: ${bugsAbiertos.length}`,
    '',
    '## Por fase',
    '',
    '| Fase | Hechas | En revisión | En progreso | Bloqueadas | Pendientes | Avance |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const f of Object.keys(FASES)) {
    const c = cuenta(trabajo.filter((i) => faseDe(i) === f));
    if (!c.total) continue;
    out.push(`| ${f} · ${FASES[f]} | ${c.hecho}/${c.total} | ${c.revision} | ${c.progreso} | ${c.bloqueado} | ${c.pendiente} | \`${barra(c.hecho, c.total)}\` ${pct(c.hecho, c.total)} % |`);
  }

  out.push('', '## Por épica', '', '| Épica | Fase | Estado | Hechas | Avance |', '| --- | --- | --- | --- | --- |');
  const ordenar = (a, b) => {
    const ia = (RE_BACKLOG_ID.exec(a.body || '') || [])[1] || `Z${a.number}`;
    const ib = (RE_BACKLOG_ID.exec(b.body || '') || [])[1] || `Z${b.number}`;
    return ia.localeCompare(ib, 'es', { numeric: true });
  };
  for (const e of [...epicas].sort(ordenar)) {
    const hijos = (hijosPorEpica.get(e.number) || []).filter((h) => h.state !== 'closed' || h.state_reason !== 'not_planned');
    const hechas = hijos.filter((h) => h.state === 'closed').length;
    out.push(`| [${e.title.replace(/\|/g, '/')}](${e.html_url}) | ${faseDe(e)} | ${ESTADO_CORTO[estadoDe(e)] || 'descartada'} | ${hechas}/${hijos.length} | \`${barra(hechas, hijos.length)}\` ${pct(hechas, hijos.length)} % |`);
  }

  const linea = (i) => {
    const quien = (i.assignees || []).map((a) => `@${a.login}`);
    if (tiene(i, 'agente: claude')) quien.push('agente Claude');
    return `- ${i.title} (#${i.number}) ${quien.length ? `· ${quien.join(', ')}` : '· sin asignar'}`;
  };
  const porEstado = (estado) => trabajo.filter((i) => i.state === 'open' && estadoDe(i) === estado);
  const secciones = [
    ['En revisión', porEstado(ESTADO.revision)],
    ['En progreso', porEstado(ESTADO.progreso)],
    ['Bloqueadas', porEstado(ESTADO.bloqueado)],
    ['Listas para tomar', porEstado(ESTADO.listo)],
    ['Bugs abiertos', bugsAbiertos],
  ];
  for (const [titulo, lista] of secciones) {
    out.push('', `## ${titulo}`, '', ...(lista.length ? lista.map(linea) : ['_Ninguna._']));
  }
  return out.join('\n');
}

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const issues = await todosLosIssues(github, owner, repo);
  const reporte = issues.find((i) => (i.body || '').includes(MARCA_PROGRESO));
  const resto = issues.filter((i) => i !== reporte);

  // Hijas de cada épica: API de sub-issues y, como respaldo, la línea **Épica:** #N.
  const hijosPorEpica = new Map();
  for (const e of resto.filter((i) => tiene(i, TIPO.epica))) {
    const hijos = await subIssues(github, owner, repo, e.number);
    const numeros = new Set(hijos.map((h) => h.number));
    for (const i of resto) {
      const m = RE_EPICA_EN_CUERPO.exec(i.body || '');
      if (m && Number(m[1]) === e.number && !numeros.has(i.number)) hijos.push(i);
    }
    hijosPorEpica.set(e.number, hijos);
  }

  const body = construirReporte({ issues: resto, hijosPorEpica, ahora: new Date() });
  const sinFecha = (t) => (t || '').replace(/Última actualización: [^(]*/, '');
  let numero;
  if (!reporte) {
    const { data } = await github.rest.issues.create({ owner, repo, title: TITULO, body });
    numero = data.number;
    try {
      await github.graphql('mutation($id: ID!) { pinIssue(input: { issueId: $id }) { issue { number } } }', { id: data.node_id });
    } catch (e) {
      core.warning(`No se pudo fijar el issue de progreso: ${e.message}`);
    }
  } else {
    numero = reporte.number;
    if (sinFecha(reporte.body) !== sinFecha(body)) {
      await github.rest.issues.update({ owner, repo, issue_number: numero, body, state: 'open' });
    }
  }
  core.info(`Progreso actualizado en #${numero}`);
  if (core.summary) await core.summary.addRaw(body.replace(MARCA_PROGRESO, '')).write();
};

module.exports.construirReporte = construirReporte;
