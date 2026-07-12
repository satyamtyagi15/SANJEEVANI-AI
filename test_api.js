import { generateFollowUpQuestion } from './src/services/AIEngine.js';

async function run() {
  try {
    const res = await generateFollowUpQuestion([{role: 'user', content: 'hello'}], 'en');
    console.log('SUCCESS:', res);
  } catch (e) {
    console.error('FAILED:', e);
  }
}

run();
