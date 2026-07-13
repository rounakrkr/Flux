/* ============================================================
   FLUX — Gemini API Module
   Handles all AI content generation via Gemini 2.0 Flash
   ============================================================ */

const Gemini = (() => {
  // API key is stored in localStorage, set by user during onboarding
  function getApiKey() {
    return localStorage.getItem('flux_api_key') || '';
  }

  function setApiKey(key) {
    localStorage.setItem('flux_api_key', key.trim());
  }

  function hasApiKey() {
    return !!getApiKey();
  }

  // Model fallback chain — if one is quota-limited, try the next
  const MODELS = [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
  ];

  function getUrl(model) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${getApiKey()}`;
  }

  // Core API call with automatic model fallback
  async function call(prompt, json = true) {
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.88,
        maxOutputTokens: 3000,
        ...(json ? { responseMimeType: 'application/json' } : {}),
      },
    };

    let lastError;
    for (const model of MODELS) {
      try {
        const res = await fetch(getUrl(model), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.status === 429 || res.status === 404) {
          // Rate limited or model unavailable — try next
          lastError = new Error(`${model}: ${res.status === 429 ? 'rate limited' : 'not available'}`);
          continue;
        }

        if (!res.ok) {
          const txt = await res.text();
          // If quota error, try next model
          if (txt.toLowerCase().includes('quota')) {
            lastError = new Error(`${model}: quota exceeded`);
            continue;
          }
          throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Empty Gemini response');
        return json ? JSON.parse(text) : text;
      } catch (err) {
        lastError = err;
        // Only retry on quota/rate errors, not on other failures
        if (!err.message.includes('rate limited') && !err.message.includes('quota')) {
          throw err;
        }
      }
    }
    throw lastError || new Error('All models exhausted');
  }

  // ---- Card schema note (for prompts) ----
  const CARD_SCHEMA = `{
  "title": "specific concept/technology name",
  "category": "category name",
  "emoji": "one relevant emoji",
  "oneLiner": "one catchy sentence, max 15 words",
  "analogy": "explain using something from everyday life (washing machine, traffic light, postal system style). 2-3 sentences. Make it creative and specific.",
  "engineerTake": "accurate technical explanation using proper terminology. 2-3 sentences.",
  "didYouKnow": "one genuinely surprising or counterintuitive fact",
  "relatedTopics": ["topic1", "topic2", "topic3"]
}`;

  // ---- Generate today's daily feed (6 cards) ----
  async function generateDailyFeed() {
    const today  = new Date().toDateString();
    const cached = Storage.getDailyFeed(today);
    if (cached && cached.length >= 4) return cached;

    const prompt = `You are a tech educator for Computer Science Engineering students. Generate today's daily tech learning digest.

Create exactly 6 diverse tech knowledge cards. Cover EXACTLY these domains (one card each):
1. AI & ML — pick something specific and non-obvious (NOT "what is machine learning")
2. IoT — a real protocol, architecture, or device concept
3. Computer Networks — a specific protocol, algorithm, or architecture
4. Cybersecurity — an attack technique, defense mechanism, or crypto concept
5. Hardware — CPU architecture, memory systems, or electronics concept
6. New Inventions or Emerging Tech — something genuinely cutting-edge

Rules:
- Avoid very basic/introductory topics. Go specific.
- The analogy field must be genuinely creative and relatable (think: explaining WiFi using water pipes, TCP handshake using a phone call)
- Make it something an engineering student would NOT have heard in class yet

Return a JSON ARRAY of exactly 6 objects. Each object must have ALL these fields:
${CARD_SCHEMA}`;

    const cards = await call(prompt);
    Storage.saveDailyFeed(today, cards);
    return cards;
  }

  // ---- Generate a single explore card ----
  async function generateExploreCard(category) {
    const catDesc = {
      'All':                'any interesting and non-obvious technology or computer science concept',
      'AI & ML':            'artificial intelligence or machine learning (specific technique, model, or concept)',
      'IoT':                'Internet of Things, embedded systems, or sensor networks',
      'Computer Networks':  'networking protocol, algorithm, or architecture',
      'Cybersecurity':      'cybersecurity, cryptography, ethical hacking, or privacy technology',
      'Hardware':           'computer hardware, CPU architecture, memory, or electronics',
      'New Inventions':     'an emerging or recently invented technology',
      'Robotics':           'robotics, automation, actuators, or control systems',
      'Programming':        'programming concept, algorithm, data structure, or CS theory',
      'The Basics':         'a fundamental computer science concept that every engineer should know (but explained in a new way)',
    };

    const topic = catDesc[category] || catDesc['All'];
    const prompt = `Generate ONE tech knowledge card about ${topic} for a CSE engineering student.

Be specific — pick an interesting concept they probably haven't heard explained well.

Return a SINGLE JSON object with ALL these fields:
${CARD_SCHEMA}

The "category" field must be: "${category === 'All' ? 'any relevant category' : category}"`;

    return await call(prompt);
  }

  // ---- Generate a batch for explore (3 cards) ----
  async function generateExploreBatch(category) {
    const catDesc = {
      'All':                'diverse interesting tech topics (mix of AI, networking, hardware, security)',
      'AI & ML':            'AI and machine learning (3 different specific concepts)',
      'IoT':                'Internet of Things and embedded systems',
      'Computer Networks':  'computer networking and protocols',
      'Cybersecurity':      'cybersecurity and cryptography',
      'Hardware':           'computer hardware and electronics',
      'New Inventions':     'emerging and cutting-edge technologies',
      'Robotics':           'robotics and automation',
      'Programming':        'programming concepts and computer science theory',
      'The Basics':         'fundamental CS concepts explained in a fresh way',
    };

    const topic = catDesc[category] || catDesc['All'];
    const prompt = `Generate 3 DIFFERENT tech knowledge cards about ${topic} for a CSE student.

Make them varied — 3 distinct concepts, not variations of the same thing.
The category field for each card should be "${category}" (or a specific subcategory if category is "All").

Return a JSON ARRAY of exactly 3 objects. Each must have ALL these fields:
${CARD_SCHEMA}`;

    return await call(prompt);
  }

  // ---- Deep dive chat ----
  async function deepDive(cardTitle, cardContext, question) {
    const prompt = `You are explaining the tech concept "${cardTitle}" to a CSE student.

What we know about this topic:
${cardContext}

The student asks: "${question}"

Respond conversationally (not like a textbook). Be clear, accurate, and engaging.
Use an analogy or example if it helps.
Keep it to 3-5 sentences max.

Return ONLY your response text — no JSON, no preamble.`;

    return await call(prompt, false);
  }

  return { generateDailyFeed, generateExploreCard, generateExploreBatch, deepDive, setApiKey, hasApiKey, getApiKey };
})();
