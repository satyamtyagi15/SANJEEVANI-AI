async function run() {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const data = await res.json();
  const freeModels = data.data.filter(m => m.id.endsWith(':free')).map(m => m.id);
  console.log(freeModels);
}

run();
