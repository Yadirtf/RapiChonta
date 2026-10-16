// Crea o actualiza en GitHub las etiquetas de .github/labels.yml.
// Las etiquetas que no están en el archivo no se tocan.
const { cargarEtiquetas, sleep } = require('./lib');

module.exports = async ({ github, context, core }) => {
  const { owner, repo } = context.repo;
  const deseadas = cargarEtiquetas();
  const actuales = await github.paginate(github.rest.issues.listLabelsForRepo, { owner, repo, per_page: 100 });
  const porNombre = new Map(actuales.map((l) => [l.name.toLowerCase(), l]));
  let creadas = 0;
  let actualizadas = 0;

  for (const l of deseadas) {
    const actual = porNombre.get(l.name.toLowerCase());
    const color = l.color.toLowerCase();
    const description = l.description || '';
    if (!actual) {
      await github.rest.issues.createLabel({ owner, repo, name: l.name, color, description });
      creadas++;
      await sleep(200);
    } else if (actual.color.toLowerCase() !== color || (actual.description || '') !== description || actual.name !== l.name) {
      await github.rest.issues.updateLabel({ owner, repo, name: actual.name, new_name: l.name, color, description });
      actualizadas++;
      await sleep(200);
    }
  }
  core.info(`Etiquetas: ${creadas} creadas, ${actualizadas} actualizadas, ${deseadas.length - creadas - actualizadas} sin cambios.`);
};
