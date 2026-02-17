const major = Number(process.versions.node.split('.')[0]);
if (major < 20 || major >= 23) {
  console.error(`\n❌ Node ${process.versions.node} no soportado para este proyecto.`);
  console.error('Usa Node 20.x o 22.x LTS (recomendado: 22).');
  process.exit(1);
}
console.log(`✅ Node ${process.versions.node} compatible.`);
