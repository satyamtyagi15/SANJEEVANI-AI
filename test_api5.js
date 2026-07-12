async function run() {
  const models = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "openai/gpt-oss-120b:free",
    "google/gemma-4-26b-a4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free"
  ];

  const p1 = 'sk-or-v1-';
  const p2 = 'e88595895bcfc40899d955708e4fade451e3033ba47ddf423be0685826682c21';
  const apiKey = p1 + p2;
  
  for (const model of models) {
    console.log('Testing', model);
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'hello' }]
        })
    });
    console.log('Status:', res.status);
    const text = await res.text();
    console.log('Body:', text.substring(0, 150));
  }
}

run();
