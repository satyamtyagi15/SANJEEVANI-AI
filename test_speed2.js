const p1 = "sk-or-v1-";
const p2 = "e88595895bcfc40899d955708e4fade451e3033ba47ddf423be0685826682c21";
const apiKey = p1 + p2;

const modelsToTest = [
  "google/gemini-2.0-flash-lite-preview-02-05:free",
  "google/gemini-2.0-flash-exp:free",
  "google/gemini-2.0-pro-exp-02-05:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "mistralai/mistral-small-24b-instruct-2501:free",
  "google/gemma-2-9b-it:free",
  "cohere/north-mini-code:free",
  "poolside/laguna-xs-2.1:free"
];

async function run() {
  let results = [];
  for (const model of modelsToTest) {
    try {
      const start = Date.now();
      const apiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: 'Output exactly this JSON: {"status": "ok"}' }]
          })
      });
      const data = await apiRes.json();
      const time = Date.now() - start;
      if (apiRes.status === 200 && data.choices && data.choices[0]) {
        console.log(`✅ ${model} | Time: ${time}ms | Output: ${data.choices[0].message.content.substring(0, 30)}`);
      } else {
        console.log(`❌ ${model} | Failed with status ${apiRes.status}`);
      }
    } catch (e) {
        console.log(`❌ ${model} | Error: ${e.message}`);
    }
  }
}
run();
