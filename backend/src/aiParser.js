const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { format, addDays } = require('date-fns');

async function extractInvoiceFromText(text, senderPhone) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd');

  const prompt = `You are an invoice data extractor. Extract invoice information from the message below and return ONLY a JSON object.

Today: ${today}  |  Default due date: ${in30}

Message:
"""
${text}
"""

Return this JSON (null for missing fields):
{
  "is_invoice_request": boolean,
  "client_name": "string",
  "client_email": "string or null",
  "client_phone": "string or null",
  "client_address": "string or null",
  "po_number": "string or null",
  "issue_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "items": [{ "description": "string", "quantity": number, "unit_price": number, "amount": number }],
  "tax_rate": number,
  "discount": number,
  "notes": "string or null",
  "payment_terms": "string or null"
}

Rules:
- is_invoice_request = true only if clearly asking to create an invoice
- Calculate relative dates ("next month", "in 30 days") from today
- Default quantity to 1 if not mentioned
- Return ONLY the JSON, no explanation`;

  try {
    let raw;

    if (process.env.GEMINI_API_KEY) {
      // Use Gemini (free tier: 1500 req/day)
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const res = await model.generateContent(prompt);
      raw = res.response.text().trim().replace(/```json|```/g, '');
    } else if (process.env.OPENAI_API_KEY) {
      // Use OpenAI
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        response_format: { type: 'json_object' }
      });
      raw = res.choices[0].message.content;
    } else if (process.env.ANTHROPIC_API_KEY) {
      // Use Claude
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      });
      raw = res.content[0].text.trim().replace(/```json|```/g, '');
    } else {
      return null;
    }

    const data = JSON.parse(raw);
    if (!data.is_invoice_request || !data.client_name || !data.items?.length) return null;
    if (senderPhone && !data.client_phone) data.client_phone = senderPhone;
    return data;

  } catch (err) {
    console.error('[AI Parser] Error:', err.message);
    return null;
  }
}

// ── Retrieval query extractor ─────────────────────────────────────────────────
// Pulls what to search for from natural-language retrieval requests.
// Tries cheap regex patterns first; falls back to AI only when needed.
async function extractRetrievalQuery(text) {
  // 1. Explicit invoice-number pattern  e.g. INV-2024-1001, INV-1001, ABC-2025-0042
  const invMatch = text.match(/\b([A-Z]{2,8}-\d{4}-\d{2,6}|[A-Z]{2,8}-\d{3,6})\b/i);
  if (invMatch) return { query: invMatch[1].toUpperCase(), type: 'number' };

  // 2. PO number  e.g. PO-1234 or PO1234
  const poMatch = text.match(/\bPO[-–]?\d+\b/i);
  if (poMatch) return { query: poMatch[0].toUpperCase(), type: 'po' };

  // 3. "[Name]'s invoice"
  const possMatch = text.match(/([A-Za-z][A-Za-z\s&.,'()-]{1,40}?)'s\s+invoice/i);
  if (possMatch) return { query: possMatch[1].trim(), type: 'client' };

  // 4. "invoice for / from / of [Name]"
  const forMatch = text.match(
    /invoice\s+(?:for|from|of)\s+([A-Za-z][A-Za-z\s&.,'()-]{1,40?)(?=[?,!]|$|\s+please|\s+thanks)/i
  );
  if (forMatch) return { query: forMatch[1].trim(), type: 'client' };

  // 5. "for / from [Name]" anywhere in message
  const anyForMatch = text.match(
    /(?:for|from)\s+([A-Z][A-Za-z\s&.,'()-]{1,40?})(?=[?,!]|$|\s+please|\s+thanks|\s+invoice)/i
  );
  if (anyForMatch) return { query: anyForMatch[1].trim(), type: 'client' };

  // 6. AI fallback — small, focused prompt
  const prompt = `A user is asking to retrieve an existing invoice via WhatsApp. Extract ONLY what they want to search for (a client name or invoice number). Return JSON only:
{"query": "the name or number", "type": "client|number|any"}

Message: "${text}"`;

  try {
    let raw;
    if (process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const res = await model.generateContent(prompt);
      raw = res.response.text().trim().replace(/```json|```/g, '');
    } else if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 80,
        response_format: { type: 'json_object' }
      });
      raw = res.choices[0].message.content;
    } else if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{ role: 'user', content: prompt }]
      });
      raw = res.content[0].text.trim().replace(/```json|```/g, '');
    }
    if (raw) {
      const data = JSON.parse(raw);
      if (data.query) return { query: data.query, type: data.type || 'any' };
    }
  } catch (_) {}

  return { query: null, type: 'any' };
}

module.exports = { extractInvoiceFromText, extractRetrievalQuery };
