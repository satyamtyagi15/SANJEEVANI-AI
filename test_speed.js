const p1 = "sk-or-v1-";
const p2 = "e88595895bcfc40899d955708e4fade451e3033ba47ddf423be0685826682c21";
const apiKey = p1 + p2;

const modelsToTest = [
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "microsoft/phi-3-mini-128k-instruct:free",
  "tencent/hy3:free",
  "poolside/laguna-xs-2.1:free",
  "cohere/north-mini-code:free",
  "qwen/qwen-2.5-7b-instruct:free",
  "google/gemini-flash-1.5-8b:free"
];

async function run() {
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
