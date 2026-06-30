// /api/find-income.js
// Vercel serverless function. Uses Google Gemini API (free tier) with
// Google Search grounding to find current, real side-income opportunities.
//
// Requires a free Gemini API key from https://aistudio.google.com/apikey
// Set it as GEMINI_API_KEY in your Vercel project's environment variables.

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
      city,
    } = req.body || {};

    if (!skills.length || !timePerWeek || !budget || !incomeGoal) {
      return res.status(400).json({ error: 'Missing required quiz fields' });
    }

    const locationLine = city
      ? `- City / Region: ${city} — prioritise opportunities available there; use local currency for income estimates`
      : `- City / Region: not specified — focus on widely-available online opportunities; use USD for income estimates`;

    const userPrompt = `
A user is looking for real, current side-income opportunities. Use Google Search to find
up-to-date, legitimate options (platforms, gigs, freelance marketplaces, current rates) —
not generic evergreen advice.

User profile:
- Skills/interests: ${skills.join(', ')}
- Time available: ${timePerWeek} per week
- Startup capital: ${budget}
- Preferred work style: ${workStyle || 'no preference'}
- Monthly income goal: ${incomeGoal}
- What matters most: ${priority || 'not specified'}
${locationLine}

Find 5 specific, currently-viable opportunities that fit this profile. For each one, search
for real current information (platform names, typical pay rates, how to get started).

Respond ONLY with valid JSON, no markdown fences, no preamble, in this exact shape:
{
  "suggestions": [
    {
      "title": "string",
      "description": "2-3 sentence description of the opportunity",
      "whyItFits": "1-2 sentences tying it to the user's specific profile",
      "estimatedEarning": "string, e.g. '₹15,000–30,000/month'",
      "startupSteps": "1-2 sentences on how to start",
      "link": "a real, relevant URL found via search (platform homepage or signup page)"
    }
  ]
}
`.trim();

    const model = 'gemini-2.0-flash'; // free-tier eligible, supports search grounding

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: userPrompt }],
            },
          ],
          tools: [{ google_search: {} }],
          generationConfig: {
            temperature: 1.0,
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return res.status(502).json({ error: 'Search service failed' });
    }

    const data = await response.json();

    // Gemini returns candidates[0].content.parts[] — collect all text parts
    const candidate = data.candidates?.[0];
    const textOutput = (candidate?.content?.parts || [])
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text)
      .join('\n');

    if (!textOutput) {
      console.error('No text in Gemini response:', JSON.stringify(data));
      return res.status(502).json({ error: 'Empty response from model' });
    }

    let parsed;
    try {
      const cleaned = textOutput.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', textOutput);
      return res.status(502).json({ error: 'Could not parse results' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('find-income handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
