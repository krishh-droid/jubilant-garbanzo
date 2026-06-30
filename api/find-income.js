// /api/find-income.js
// Vercel serverless function. Receives quiz answers, asks Claude (with web_search)
// to find current, real side-income opportunities, and returns structured JSON.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      skills = [],
      timePerWeek,
      budget,
      workStyle,
      incomeGoal,
      priority,
    } = req.body || {};

    if (!skills.length || !timePerWeek || !budget || !incomeGoal) {
      return res.status(400).json({ error: 'Missing required quiz fields' });
    }

    const userPrompt = `
A user is looking for real, current side-income opportunities. Use web search to find
up-to-date, legitimate options (platforms, gigs, freelance marketplaces, current rates) —
not generic evergreen advice.

User profile:
- Skills/interests: ${skills.join(', ')}
- Time available: ${timePerWeek} per week
- Startup capital: ${budget}
- Preferred work style: ${workStyle || 'no preference'}
- Monthly income goal: ${incomeGoal}
- What matters most: ${priority || 'not specified'}

Find 5 specific, currently-viable opportunities that fit this profile. For each one, search
for real current information (platform names, typical pay rates, how to get started).
Express income estimates in USD (e.g. "$500–$2,000/month").

Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "suggestions": [
    {
      "title": "string",
      "description": "2-3 sentence description of the opportunity",
      "whyItFits": "1-2 sentences tying it to the user's specific profile",
      "estimatedEarning": "string, e.g. '$500–$2,000/month'",
      "startupSteps": "1-2 sentences on how to start",
      "link": "a real, relevant URL found via search (platform homepage or signup page)"
    }
  ]
}
`.trim();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: userPrompt }],
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return res.status(502).json({ error: 'Search service failed' });
    }

    const data = await response.json();

    // Collect only the text blocks (web_search produces tool_use / tool_result
    // blocks interleaved with text — we just want Claude's final text output)
    const textBlocks = (data.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    let parsed;
    try {
      const cleaned = textBlocks.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Claude response:', textBlocks);
      return res.status(502).json({ error: 'Could not parse results' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('find-income handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
