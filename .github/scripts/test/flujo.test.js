// Pruebas de los scripts del flujo contra un GitHub falso en memoria.
// Ejecutar: node --test .github/scripts/test/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../lib');

// lib.sleep evita superar los límites de GitHub; en pruebas no espera.
// Se reemplaza antes de cargar los scripts porque lo copian al importarlo.
lib.sleep = async () => {};

const backlogSync = require('../backlog');
const etiquetasSync = require('../etiquetas');
const flujo = require('../flujo');
const progreso = require('../progreso');
const { valoresDeseados } = require('../tablero');

function githubFalso() {
  const estado = { issues: [], labels: [], comentarios: [], padres: new Map(), siguiente: 1 };
  const buscar = (n) => {
    const i = estado.issues.find((x) => x.number === n);
    if (!i) { const e = new Error('Not Found'); e.status = 404; throw e; }
    return i;
  };
  const rest = {
    issues: {
      listForRepo: async () => ({ data: estado.issues }),
      listLabelsForRepo: async () => ({ data: estado.labels }),
      createLabel: async ({ name, color, description }) => { estado.labels.push({ name, color, description }); },
      updateLabel: async ({ name, new_name, color, description }) => {
        Object.assign(estado.labels.find((l) => l.name === name), { name: new_name, color, description });
      },
      create: async ({ title, body, labels = [] }) => {
        const n = estado.siguiente++;
        const i = { id: 1000 + n, node_id: `I_${n}`, number: n, title, body, state: 'open', state_reason: null,
          labels: labels.map((name) => ({ name })), assignees: [], html_url: `https://github.com/o/r/issues/${n}` };
        estado.issues.push(i);
        return { data: { ...i } };
      },
      get: async ({ issue_number }) => ({ data: JSON.parse(JSON.stringify(buscar(issue_number))) }),
      update: async ({ issue_number, ...cambios }) => {
        const i = buscar(issue_number);
        if (cambios.state === 'open') cambios.state_reason = null;
        Object.assign(i, cambios);
        return { data: i };
      },
      addLabels: async ({ issue_number, labels }) => {
        const i = buscar(issue_number);
        for (const name of labels) if (!i.labels.some((l) => l.name === name)) i.labels.push({ name });
      },
      removeLabel: async ({ issue_number, name }) => {
        const i = buscar(issue_number);
        i.labels = i.labels.filter((l) => l.name !== name);
      },
      createComment: async ({ issue_number, body }) => { estado.comentarios.push({ issue_number, body }); },
    },
  };
  const request = async (ruta, p) => {
    if (ruta.startsWith('POST') && ruta.endsWith('/sub_issues')) {
      const hijo = estado.issues.find((i) => i.id === p.sub_issue_id);
      if (estado.padres.has(hijo.number)) throw new Error('ya tiene padre');
      estado.padres.set(hijo.number, p.issue_number);
      return { data: {} };
    }
    if (ruta.endsWith('/sub_issues')) {
      return { data: estado.issues.filter((i) => estado.padres.get(i.number) === p.issue_number) };
    }
    if (ruta.endsWith('/parent')) {
      const padre = estado.padres.get(p.issue_number);
      if (!padre) { const e = new Error('Not Found'); e.status = 404; throw e; }
      return { data: buscar(padre) };
    }
    throw new Error(`Ruta no simulada: ${ruta}`);
  };
  const paginate = async (fn, params) => {
    if (typeof fn === 'string') return (await request(fn, params)).data;
    return (await fn(params)).data;
  };
  const graphql = async () => ({});
  return { github: { rest, request, paginate, graphql }, estado, buscar };
}

const core = { info() {}, warning() {}, notice() {}, setOutput(k, v) { this.salida = { [k]: v }; }, summary: null };
const contexto = (eventName = 'push', payload = {}) => ({ eventName, payload, repo: { owner: 'o', repo: 'r' } });
const etiquetas = (i) => i.labels.map((l) => l.name);

async function sembrar() {
  const gh = githubFalso();
  await etiquetasSync({ github: gh.github, context: contexto(), core });
  await backlogSync({ github: gh.github, context: contexto(), core });
  return gh;
}

test('el backlog es válido', () => {
  assert.deepEqual(lib.validar(lib.cargarBacklog(), lib.cargarEtiquetas()), []);
});

test('crea épicas e historias enlazadas y no duplica al repetir', async () => {
  const gh = await sembrar();
  const { epicas } = lib.cargarBacklog();
  const totalHistorias = epicas.reduce((n, e) => n + e.historias.length, 0);
  assert.equal(gh.estado.issues.length, epicas.length + totalHistorias);
  assert.equal(gh.estado.padres.size, totalHistorias);
  const e01 = gh.estado.issues.find((i) => i.title.startsWith('E01 '));
  const h011 = gh.estado.issues.find((i) => i.title.startsWith('H01.1 '));
  assert.equal(gh.estado.padres.get(h011.number), e01.number);
  assert.match(e01.body, new RegExp(`- #${h011.number}\\n`));
  assert.match(h011.body, new RegExp(`\\*\\*Épica:\\*\\* #${e01.number}`));
  assert.ok(etiquetas(h011).includes('tipo: historia'));
  assert.ok(etiquetas(h011).includes('estado: backlog'));
  assert.ok(etiquetas(h011).includes('fase: 1'));
  for (const label of gh.estado.issues.flatMap(etiquetas)) {
    assert.ok(gh.estado.labels.some((l) => l.name === label), `falta la etiqueta ${label}`);
  }

  await backlogSync({ github: gh.github, context: contexto(), core });
  assert.equal(gh.estado.issues.length, epicas.length + totalHistorias);
});

test('PR: borrador, revisión e integración cierran la historia y la épica', async () => {
  const gh = await sembrar();
  const e05 = gh.estado.issues.find((i) => i.title.startsWith('E05 '));
  const hijas = gh.estado.issues.filter((i) => gh.estado.padres.get(i.number) === e05.number);
  const [primera, ...resto] = hijas;
  const pr = (extra) => ({ number: 500, title: 'feat: CI', body: `Closes #${primera.number}`, head: { ref: 'feature/ci' }, base: { ref: 'develop' }, draft: false, merged: false, ...extra });

  await flujo({ github: gh.github, context: contexto('pull_request', { action: 'opened', pull_request: pr({ draft: true }) }), core });
  assert.ok(etiquetas(gh.buscar(primera.number)).includes('estado: en progreso'));
  assert.ok(etiquetas(gh.buscar(e05.number)).includes('estado: en progreso'), 'la épica empieza');

  await flujo({ github: gh.github, context: contexto('pull_request', { action: 'ready_for_review', pull_request: pr() }), core });
  assert.deepEqual(etiquetas(gh.buscar(primera.number)).filter((l) => l.startsWith('estado:')), ['estado: en revisión']);

  await flujo({ github: gh.github, context: contexto('pull_request', { action: 'closed', pull_request: pr({ merged: true }) }), core });
  assert.equal(gh.buscar(primera.number).state, 'closed');
  assert.ok(etiquetas(gh.buscar(primera.number)).includes('estado: hecho'));
  assert.equal(gh.buscar(e05.number).state, 'open', 'la épica sigue abierta con historias pendientes');

  for (const h of resto) {
    await gh.github.rest.issues.update({ owner: 'o', repo: 'r', issue_number: h.number, state: 'closed', state_reason: 'completed' });
    await flujo({ github: gh.github, context: contexto('issues', { action: 'closed', issue: gh.buscar(h.number) }), core });
  }
  assert.equal(gh.buscar(e05.number).state, 'closed', 'la épica se cierra con la última historia');
  assert.ok(etiquetas(gh.buscar(e05.number)).includes('estado: hecho'));
});

test('asignar mueve a en progreso y una etiqueta de estado reemplaza a la anterior', async () => {
  const gh = await sembrar();
  const h = gh.estado.issues.find((i) => i.title.startsWith('H02.1 '));
  h.assignees = [{ login: 'Yadirtf' }];
  await flujo({ github: gh.github, context: contexto('issues', { action: 'assigned', issue: gh.buscar(h.number) }), core });
  assert.deepEqual(etiquetas(gh.buscar(h.number)).filter((l) => l.startsWith('estado:')), ['estado: en progreso']);

  gh.buscar(h.number).labels.push({ name: 'estado: bloqueado' });
  await flujo({ github: gh.github, context: contexto('issues', { action: 'labeled', label: { name: 'estado: bloqueado' }, issue: gh.buscar(h.number) }), core });
  assert.deepEqual(etiquetas(gh.buscar(h.number)).filter((l) => l.startsWith('estado:')), ['estado: bloqueado']);
});

test('issue desde plantilla: etiquetas desde el formulario y enlace a la épica', async () => {
  const gh = await sembrar();
  const e04 = gh.estado.issues.find((i) => i.title.startsWith('E04 '));
  const body = [`### Épica\n\n#${e04.number}`, '### Como\n\ncliente', '### Áreas\n\napi, web', '### Fase\n\nFase 1 · Catálogo y pedido', '### Prioridad\n\nMedia', '### Notas\n\n_No response_'].join('\n\n');
  const { data: nuevo } = await gh.github.rest.issues.create({ owner: 'o', repo: 'r', title: 'Pagar con propina', body, labels: ['tipo: historia'] });
  await flujo({ github: gh.github, context: contexto('issues', { action: 'opened', issue: nuevo }), core });
  const i = gh.buscar(nuevo.number);
  for (const l of ['área: api', 'área: web', 'fase: 1', 'prioridad: media', 'estado: backlog']) assert.ok(etiquetas(i).includes(l), l);
  assert.equal(gh.estado.padres.get(nuevo.number), e04.number);
  assert.match(gh.buscar(e04.number).body, new RegExp(`- #${nuevo.number}\\n`));
});

test('lee los issues que cierra un PR', () => {
  assert.deepEqual(lib.issuesQueCierra({ body: 'Closes #12, #13\nresuelve #20', head: 'feature/31-carrito' }).sort((a, b) => a - b), [12, 13, 20, 31]);
  assert.deepEqual(lib.issuesQueCierra({ body: 'Relacionado con #4', head: 'feature/carrito' }), []);
});

test('el reporte de progreso cuenta por fase y épica', async () => {
  const gh = await sembrar();
  const h = gh.estado.issues.find((i) => i.title.startsWith('H01.1 '));
  Object.assign(h, { state: 'closed', state_reason: 'completed' });
  await progreso({ github: gh.github, context: contexto(), core });
  const reporte = gh.estado.issues.find((i) => i.body.includes(lib.MARCA_PROGRESO));
  assert.ok(reporte);
  assert.match(reporte.body, /\*\*1 de 66 historias y tareas hechas/);
  assert.match(reporte.body, /\| \[E01 · Identidad y acceso\]\([^)]+\) \| 1 \| backlog \| 1\/5 \|/);
});

test('el tablero traduce etiquetas a campos', () => {
  const v = valoresDeseados({ state: 'open', labels: [{ name: 'estado: en revisión' }, { name: 'fase: 2' }, { name: 'prioridad: alta' }, { name: 'tipo: historia' }] });
  assert.equal(v.Status[0], 'En revisión');
  assert.deepEqual(v.Fase, ['Fase 2']);
  assert.deepEqual(v.Prioridad, ['Alta']);
  assert.deepEqual(v.Tipo, ['Historia']);
});
