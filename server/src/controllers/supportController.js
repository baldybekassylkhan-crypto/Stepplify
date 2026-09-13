import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8911267751:AAFr07ON9p3QLGPPpbTRCCk7ML6cEc8Th6E';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHATS_FILE = path.join(__dirname, '../../telegram_chats.json');

// List of admin usernames (lowercase, without @)
const ADMIN_USERNAMES = ['alkn54'];

const userStates = new Map(); // chatId -> selected category
let updateOffset = 0;
let isPolling = false;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getKnownChatIds() {
  try {
    if (fs.existsSync(CHATS_FILE)) {
      const data = fs.readFileSync(CHATS_FILE, 'utf8');
      const list = JSON.parse(data);
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {
    console.error('Error reading telegram_chats.json:', e);
  }
  // Default to alkn54 chat ID if file doesn't exist yet
  return [5342772042];
}

function saveChatIds(chatIds) {
  try {
    const unique = [...new Set(chatIds)];
    fs.writeFileSync(CHATS_FILE, JSON.stringify(unique, null, 2));
    return unique;
  } catch (e) {
    console.error('Error saving telegram_chats.json:', e);
    return chatIds;
  }
}

function addAdminChatId(chatId) {
  const known = getKnownChatIds();
  if (!known.includes(chatId)) {
    known.push(chatId);
    saveChatIds(known);
  }
}

async function sendTelegramMessage(chatId, text, options = {}) {
  try {
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      ...options
    };
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (err) {
    console.error(`Failed to send Telegram message to ${chatId}:`, err);
    return null;
  }
}

function sendStartKeyboard(chatId) {
  return sendTelegramMessage(
    chatId,
    '<b>Здравствуйте!</b>\nПожалуйста, выберите категорию вашего обращения:',
    {
      reply_markup: {
        keyboard: [
          [
            { text: 'Вопрос' },
            { text: 'Жалоба' },
            { text: 'Пожелание' }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
  );
}

async function handleTelegramUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.chat) return;

  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const senderName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Пользователь';
  const usernameRaw = msg.from?.username || '';
  const username = usernameRaw ? `@${usernameRaw}` : '';
  const usernameLower = usernameRaw.toLowerCase();

  // If message comes from known admin username, ensure admin chatId is recorded
  if (ADMIN_USERNAMES.includes(usernameLower)) {
    addAdminChatId(chatId);
  }

  if (text === '/start') {
    userStates.delete(chatId);
    await sendStartKeyboard(chatId);
    return;
  }

  if (text === 'Вопрос' || text === 'Жалоба' || text === 'Пожелание') {
    userStates.set(chatId, text);
    await sendTelegramMessage(
      chatId,
      `Вы выбрали категорию: <b>${escapeHtml(text)}</b>.\n\nПожалуйста, опишите ваше обращение в сообщении ниже:`
    );
    return;
  }

  const category = userStates.get(chatId);
  if (category) {
    userStates.delete(chatId);
    
    // Reply to the user confirming receipt
    await sendTelegramMessage(
      chatId,
      `Спасибо! Ваше обращение (Категория: <b>${escapeHtml(category)}</b>) получено.\nМы ответим вам в ближайшее время!`
    );

    // Format quote notification for admin
    const formattedMessage = `<b>Новое обращение в поддержку Stepplify</b>\n\n` +
      `<b>Категория:</b> ${escapeHtml(category)}\n` +
      `<b>От кого:</b> ${escapeHtml(senderName)} (${escapeHtml(username || 'без username')})\n\n` +
      `<blockquote>${escapeHtml(text)}</blockquote>`;

    const adminChats = getKnownChatIds();
    for (const adminId of adminChats) {
      // Don't echo back if admin sent a message to themselves in testing
      await sendTelegramMessage(adminId, formattedMessage);
    }
  } else {
    // Default reply if no category is picked yet
    await sendStartKeyboard(chatId);
  }
}

async function startTelegramPolling() {
  if (isPolling) return;
  isPolling = true;

  while (isPolling) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${updateOffset}&timeout=10`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          updateOffset = update.update_id + 1;
          await handleTelegramUpdate(update);
        }
      }
    } catch (err) {
      // Ignore polling errors to keep loop running
    }
    await new Promise(r => setTimeout(r, 1000));
  }
}

// Start polling immediately when module is imported in server
startTelegramPolling();

export const sendSupportMessage = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ error: 'Тема и сообщение обязательны' });
    }

    const user = req.user;
    const senderInfo = user 
      ? `${user.name || 'Пользователь'} (${user.email || 'ID: ' + user.id})`
      : 'Гость (неавторизован)';

    const formattedMessage = `<b>Новое обращение в поддержку с сайта Stepplify</b>\n\n` +
      `<b>Категория:</b> ${escapeHtml(subject)}\n` +
      `<b>От кого:</b> ${escapeHtml(senderInfo)}\n\n` +
      `<blockquote>${escapeHtml(message)}</blockquote>`;

    const adminChats = getKnownChatIds();

    if (adminChats.length === 0) {
      console.warn('Telegram support: No admin Telegram chat_ids found.');
      return res.json({ 
        success: true, 
        message: 'Обращение успешно создано' 
      });
    }

    let sentCount = 0;
    for (const adminId of adminChats) {
      const result = await sendTelegramMessage(adminId, formattedMessage);
      if (result && result.ok) sentCount++;
    }

    return res.json({ success: true, sentCount });
  } catch (error) {
    console.error('Support controller error:', error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
