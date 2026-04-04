const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
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

    if (process.env.OPENAI_API_KEY) {
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

module.exports = { extractInvoiceFromText };
