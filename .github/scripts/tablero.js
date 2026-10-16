// Sincroniza los issues con el tablero de GitHub Projects "RapiChonta · Tablero".
// Necesita el secreto PROJECT_TOKEN (token clásico con permisos project y repo):
// el GITHUB_TOKEN de Actions no puede escribir en proyectos de un usuario.
//
// Si el tablero no existe, lo crea, lo enlaza al repositorio y le pone los campos
// Status, Fase, Prioridad y Tipo. Después agrega cada issue y copia sus etiquetas
// a esos campos. `numeros` es "todos" o una lista separada por comas.
const { TIPO, ESTADO, MARCA_PROGRESO, estadoDe, nombresEtiquetas, todosLosIssues, sleep } = require('./lib');

const TITULO = 'RapiChonta · Tablero';
const op = (name, color, description = '') => ({ name, color, description });

const CAMPOS = {
  Status: [
    op('Backlog', 'GRAY', 'Identificado, sin refinar'),
    op('Listo', 'BLUE', 'Refinado; se puede tomar'),
    op('En progreso', 'YELLOW', 'Alguien lo está trabajando'),
    op('En revisión', 'PURPLE', 'PR listo para revisar'),
    op('Bloqueado', 'RED', 'No puede avanzar'),
    op('Hecho', 'GREEN', 'Integrado en develop'),
  ],
  Fase: [1, 2, 3, 4, 5].map((n) => op(`Fase ${n}`, n <= 2 ? 'BLUE' : 'GRAY')),
  Prioridad: [op('Alta', 'RED'), op('Media', 'YELLOW'), op('Baja', 'GRAY')],
  Tipo: [op('Épica', 'PURPLE'), op('Historia', 'BLUE'), op('Tarea', 'GREEN'), op('Bug', 'RED')],
};

// Nombres aceptados en tableros que ya existían con las columnas por defecto.
const ALIAS_STATUS = {
  [ESTADO.backlog]: ['Backlog', 'Todo'],
  [ESTADO.listo]: ['Listo', 'Ready', 'Todo'],
  [ESTADO.progreso]: ['En progreso', 'In Progress', 'In progress'],
  [ESTADO.revision]: ['En revisión', 'In Review', 'In review', 'En progreso', 'In Progress'],
  [ESTADO.bloqueado]: ['Bloqueado', 'Blocked', 'En progreso', 'In Progress'],
  [ESTADO.hecho]: ['Hecho', 'Done'],
};

function valoresDeseados(issue) {
  const labels = nombresEtiquetas(issue);
  const v = {};
  const estado = estadoDe(issue);
  if (estado) v.Status = ALIAS_STATUS[estado];
  const fase = labels.find((l) => l.startsWith('fase: '));
  if (fase) v.Fase = [`Fase ${fase.slice(6)}`];
  const prioridad = labels.find((l) => l.startsWith('prioridad: '));
  if (prioridad) {
    const p = prioridad.slice(11);
    v.Prioridad = [p.charAt(0).toUpperCase() + p.slice(1)];
  }
  const tipo = { [TIPO.epica]: 'Épica', [TIPO.historia]: 'Historia', [TIPO.tarea]: 'Tarea', [TIPO.bug]: 'Bug' };
  const t = labels.find((l) => tipo[l]);
  if (t) v.Tipo = [tipo[t]];
  return v;
}

async function buscarOCrearTablero({ github, core, owner, repoNodeId }) {
  const { repositoryOwner: duenio } = await github.graphql(
    `query($login: String!) {
      repositoryOwner(login: $login) {
        id
        ... on User { projectsV2(first: 100) { nodes { id number title url } } }
        ... on Organization { projectsV2(first: 100) { nodes { id number title url } } }
      }
    }`,
    { login: owner },
  );
  const numero = Number(process.env.PROJECT_NUMBER || 0);
  const nodos = (duenio.projectsV2 && duenio.projectsV2.nodes) || [];
  const existente = nodos.find((p) => (numero ? p.number === numero : p.title === TITULO));
  if (existente) return { proyecto: existente, nuevo: false };
  if (numero) throw new Error(`No existe el proyecto número ${numero} de ${owner}`);

  const { createProjectV2: { projectV2: proyecto } } = await github.graphql(
    `mutation($owner: ID!, $title: String!, $repo: ID!) {
      createProjectV2(input: { ownerId: $owner, title: $title, repositoryId: $repo }) { projectV2 { id number title url } }
    }`,
    { owner: duenio.id, title: TITULO, repo: repoNodeId },
  );
  try {
    await github.graphql(
      `mutation($id: ID!, $d: String!, $r: String!) {
        updateProjectV2(input: { projectId: $id, shortDescription: $d, readme: $r }) { projectV2 { id } }
      }`,
      {
        id: proyecto.id,
        d: 'Épicas, historias y tareas de RapiChonta. Lo mueve el flujo de GitHub Actions.',
        r: 'Este tablero se sincroniza solo desde los issues del repositorio. Cambie el estado con las etiquetas `estado: …` o con los PR; ver Docs/12-flujo-de-trabajo.md.',
      },
    );
  } catch (e) { core.warning(`No se pudo describir el tablero: ${e.message}`); }
  core.notice(`Tablero creado: ${proyecto.url}`);
  return { proyecto, nuevo: true };
}

async function leerCampos(github, projectId) {
  const { node } = await github.graphql(
    `query($id: ID!) { node(id: $id) { ... on ProjectV2 {
      items(first: 1) { totalCount }
      fields(first: 50) { nodes {
        ... on ProjectV2FieldCommon { id name dataType }
        ... on ProjectV2SingleSelectField { options { id name } }
      } }
    } } }`,
    { id: projectId },
  );
  const campos = {};
  for (const f of node.fields.nodes) if (f && f.name) campos[f.name] = f;
  return { campos, totalItems: node.items.totalCount };
}

async function prepararCampos({ github, core, proyecto, nuevo }) {
  let { campos, totalItems } = await leerCampos(github, proyecto.id);
  const status = campos.Status;
  const nombresStatus = new Set((status && status.options || []).map((o) => o.name));
  const faltan = CAMPOS.Status.some((o) => !nombresStatus.has(o.name));
  if (status && faltan && (nuevo || totalItems === 0)) {
    try {
      await github.graphql(
        `mutation($id: ID!, $opts: [ProjectV2SingleSelectFieldOptionInput!]) {
          updateProjectV2Field(input: { fieldId: $id, singleSelectOptions: $opts }) { projectV2Field { ... on ProjectV2SingleSelectField { id } } }
        }`,
        { id: status.id, opts: CAMPOS.Status },
      );
    } catch (e) {
      core.warning(`No se pudieron poner las columnas en español (${e.message}); se usan Todo / In Progress / Done.`);
    }
  } else if (faltan) {
    core.warning('El tablero ya tenía tarjetas con otras columnas; agregue a mano en Status las opciones Backlog, Listo, En progreso, En revisión, Bloqueado y Hecho. Mientras tanto se usan las equivalentes.');
  }
  for (const nombre of ['Fase', 'Prioridad', 'Tipo']) {
    if (campos[nombre]) continue;
    await github.graphql(
      `mutation($id: ID!, $name: String!, $opts: [ProjectV2SingleSelectFieldOptionInput!]) {
        createProjectV2Field(input: { projectId: $id, dataType: SINGLE_SELECT, name: $name, singleSelectOptions: $opts }) {
          projectV2Field { ... on ProjectV2SingleSelectField { id } }
        }
      }`,
      { id: proyecto.id, name: nombre, opts: CAMPOS[nombre] },
    );
  }
  return (await leerCampos(github, proyecto.id)).campos;
}

async function leerItems(github, projectId, repoNombre) {
  const items = new Map();
  let after = null;
  do {
    const { node } = await github.graphql(
      `query($id: ID!, $after: String) { node(id: $id) { ... on ProjectV2 {
        items(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            content { ... on Issue { number repository { nameWithOwner } } }
            fieldValues(first: 20) { nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { optionId field { ... on ProjectV2FieldCommon { id } } }
            } }
          }
        }
      } } }`,
      { id: projectId, after },
    );
    for (const it of node.items.nodes) {
      if (!it.content || !it.content.number || it.content.repository.nameWithOwner !== repoNombre) continue;
      const valores = {};
      for (const v of it.fieldValues.nodes) if (v && v.field) valores[v.field.id] = v.optionId;
      items.set(it.content.number, { id: it.id, valores });
    }
    after = node.items.pageInfo.hasNextPage ? node.items.pageInfo.endCursor : null;
  } while (after);
  return items;
}

module.exports = async ({ github, context, core, numeros = 'todos' }) => {
  const { owner, repo } = context.repo;
  const repoNombre = `${owner}/${repo}`;
  const repoNodeId = context.payload.repository && context.payload.repository.node_id
    ? context.payload.repository.node_id
    : (await github.rest.repos.get({ owner, repo })).data.node_id;

  const { proyecto, nuevo } = await buscarOCrearTablero({ github, core, owner, repoNodeId });
  const campos = await prepararCampos({ github, core, proyecto, nuevo });
  const items = await leerItems(github, proyecto.id, repoNombre);

  let issues;
  if (numeros === 'todos') {
    issues = await todosLosIssues(github, owner, repo);
  } else {
    const lista = String(numeros).split(',').map(Number).filter(Boolean);
    issues = [];
    for (const n of lista) issues.push((await github.rest.issues.get({ owner, repo, issue_number: n })).data);
  }
  issues = issues.filter((i) => !i.pull_request && !(i.body || '').includes(MARCA_PROGRESO));

  let agregados = 0;
  let cambios = 0;
  for (const issue of issues) {
    let item = items.get(issue.number);
    if (!item) {
      const { addProjectV2ItemById: r } = await github.graphql(
        'mutation($p: ID!, $c: ID!) { addProjectV2ItemById(input: { projectId: $p, contentId: $c }) { item { id } } }',
        { p: proyecto.id, c: issue.node_id },
      );
      item = { id: r.item.id, valores: {} };
      items.set(issue.number, item);
      agregados++;
      await sleep(250);
    }
    for (const [campo, candidatos] of Object.entries(valoresDeseados(issue))) {
      const f = campos[campo];
      if (!f || !f.options) continue;
      const opcion = candidatos.map((n) => f.options.find((o) => o.name === n)).find(Boolean);
      if (!opcion || item.valores[f.id] === opcion.id) continue;
      await github.graphql(
        `mutation($p: ID!, $i: ID!, $f: ID!, $o: String!) {
          updateProjectV2ItemFieldValue(input: { projectId: $p, itemId: $i, fieldId: $f, value: { singleSelectOptionId: $o } }) { projectV2Item { id } }
        }`,
        { p: proyecto.id, i: item.id, f: f.id, o: opcion.id },
      );
      item.valores[f.id] = opcion.id;
      cambios++;
      await sleep(150);
    }
  }
  core.info(`Tablero ${proyecto.url}: ${agregados} issues agregados, ${cambios} campos actualizados.`);
};

module.exports.valoresDeseados = valoresDeseados;
