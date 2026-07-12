async function run() {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const data = await res.json();
  const freeModels = data.data.filter(m => m.id.endsWith(':free')).map(m => m.id);
  
  const p1 = 'sk-or-v1-';
  const p2 = 'e88595895bcfc40899d955708e4fade451e3033ba47ddf423be0685826682c21';
  const apiKey = p1 + p2;

  let workingModels = [];
  for (const model of freeModels) {
    try {
      const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Say OK' }]
          })
      });
      if (apiRes.status === 200) {
        workingModels.push(model);
        console.log('✅ WORKING:', model);
      } else {
        console.log('❌ FAILED:', model, apiRes.status);
      }
    } catch (e) {
        console.log('❌ ERROR:', model);
    }
  }
  console.log('--- ALL WORKING MODELS ---');
  console.log(workingModels);
}
run();
