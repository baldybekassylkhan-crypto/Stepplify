import axios from 'axios';

// 4. AI_EditDraft (Проверка текста через xAI Grok API)
export const aiEditDraft = async (req, res) => {
  try {
    const { draftText } = req.body;

    if (!draftText || draftText.trim().length === 0) {
      return res.status(400).json({ error: 'Пожалуйста, предоставьте текст черновика для проверки.' });
    }

    const apiKey = process.env.GROK_API_KEY;

    if (!apiKey || apiKey === 'your_xai_grok_api_key_here') {
      // Fallback response for development/testing if API key is not configured
      const mockEditedText = draftText
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/([.!?])\s*([a-zа-я])/g, (m, p1, p2) => `${p1} ${p2.toUpperCase()}`);

      return res.json({
        success: true,
        isMock: true,
        message: 'Редактирование выполнено (демо-режим без GROK_API_KEY)',
        originalText: draftText,
        improvedText: mockEditedText,
      });
    }

    // Request to Groq API (since the provided key is a Groq gsk_ key)
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'Ты — профессиональный редактор научных и публицистических статей на русском и казахском языках. Твоя задача — проверить орфографию, пунктуацию, исправить стилистические и речевые ошибки, улучшить выразительность и сделать текст академически либо публицистически красивым, сохраняя первоначальный смысл автора. Верни только исправленный текст без вводных фраз.',
          },
          {
            role: 'user',
            content: draftText,
          },
        ],
        temperature: 0.3,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    );

    const improvedText = response.data?.choices?.[0]?.message?.content?.trim() || draftText;

    return res.json({
      success: true,
      isMock: false,
      originalText: draftText,
      improvedText,
    });
  } catch (error) {
    console.error('Error in AI_EditDraft (Grok API):', error?.response?.data || error.message);
    return res.status(500).json({
      error: 'Ошибка при вызове xAI Grok API для вычитки статьи.',
      details: error?.response?.data?.error?.message || error.message,
    });
  }
};
