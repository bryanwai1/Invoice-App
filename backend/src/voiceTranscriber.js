const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Download audio from Green API and transcribe via Groq Whisper (free).
 * Falls back gracefully if GROQ_API_KEY is not set.
 */
async function transcribeAudio(downloadUrl, apiToken) {
  if (!process.env.GROQ_API_KEY) {
    console.log('[Voice] GROQ_API_KEY not set — skipping transcription');
    return null;
  }

  try {
    // Download audio file from Green API
    const audioRes = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      headers: { 'Authorization': `Bearer ${apiToken}` },
      timeout: 20000
    });

    const tmpFile = path.join(os.tmpdir(), `wa_audio_${Date.now()}.ogg`);
    fs.writeFileSync(tmpFile, Buffer.from(audioRes.data));

    // Send to Groq Whisper
    const form = new FormData();
    form.append('file', fs.createReadStream(tmpFile), { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-large-v3');
    form.append('language', 'en');

    const res = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      timeout: 30000
    });

    fs.unlinkSync(tmpFile);
    console.log('[Voice] Transcribed:', res.data.text?.substring(0, 100));
    return res.data.text;
  } catch (err) {
    console.error('[Voice] Transcription failed:', err.message);
    return null;
  }
}

module.exports = { transcribeAudio };
