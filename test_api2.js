async function run() {
  const p1 = 'sk-or-v1-';
  const p2 = 'e88595895bcfc40899d955708e4fade451e3033ba47ddf423be0685826682c21';
  const apiKey = p1 + p2;
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        messages: [{ role: 'user', content: 'hello' }]
      })
  });
  console.log('Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Body:', text);
}

run();
