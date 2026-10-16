// Crea en GitHub las épicas e historias de backlog/epicas.yml que todavía no
// existan (las reconoce por la marca <!-- backlog-id: … --> del cuerpo), enlaza
// cada historia como sub-issue de su épica y completa la lista de historias de
// la épica. Nunca reescribe un issue que ya existe: desde que se crea, el issue
// es la fuente de verdad.
const {
  RE_BACKLOG_ID, sleep, cargarBacklog, etiquetasEpica, etiquetasHistoria,
  cuerpoEpica, cuerpoHistoria, cuerpoEpicaConHistorias, todosLosIssues, subIssues, enlazarSubIssue,
} = require('./lib');

const PAUSA_MS = 1500; // GitHub limita la creación de contenido por minuto

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const slug = `${owner}/${repo}`;
  const backlog = cargarBacklog();
  const existentes = await todosLosIssues(github, owner, repo);
  const porId = new Map();
  for (const i of existentes) {
    const m = RE_BACKLOG_ID.exec(i.body || '');
    if (m && !porId.has(m[1])) porId.set(m[1], i);
  }

  const resumen = { epicas: 0, historias: 0, enlaces: 0 };
  const crear = async (titulo, body, labels) => {
    const { data } = await github.rest.issues.create({ owner, repo, title: titulo, body, labels });
    await sleep(PAUSA_MS);
    return data;
  };

  for (const e of backlog.epicas) {
    let epica = porId.get(e.id);
    if (!epica) {
      epica = await crear(`${e.id} · ${e.titulo}`, cuerpoEpica(e, slug), etiquetasEpica(e));
      porId.set(e.id, epica);
      resumen.epicas++;
      core.info(`Creada épica #${epica.number} ${e.id} · ${e.titulo}`);
    }

    const hijos = new Set((await subIssues(github, owner, repo, epica.number)).map((s) => s.number));
    const historias = [];
    for (const h of e.historias) {
      let issue = porId.get(h.id);
      if (!issue) {
        issue = await crear(`${h.id} · ${h.titulo}`, cuerpoHistoria(e, h, backlog.requerimientos, slug, epica.number), etiquetasHistoria(e, h));
        porId.set(h.id, issue);
        resumen.historias++;
        core.info(`  Creada historia #${issue.number} ${h.id} · ${h.titulo}`);
      }
      historias.push({ numero: issue.number });
      if (!hijos.has(issue.number) && (await enlazarSubIssue(github, owner, repo, epica.number, issue, core))) {
        resumen.enlaces++;
        await sleep(300);
      }
    }

    const cuerpo = cuerpoEpicaConHistorias(epica.body || '', historias);
    if (cuerpo !== (epica.body || '')) {
      await github.rest.issues.update({ owner, repo, issue_number: epica.number, body: cuerpo });
      epica.body = cuerpo;
      await sleep(300);
    }
  }

  const texto = `Backlog: ${resumen.epicas} épicas y ${resumen.historias} historias creadas, ${resumen.enlaces} sub-issues enlazados.`;
  core.info(texto);
  if (core.summary) await core.summary.addHeading('Backlog', 3).addRaw(texto).write();
};
