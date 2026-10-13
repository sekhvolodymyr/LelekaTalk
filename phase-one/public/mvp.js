import * as encryption from '/crypto.js';
import { bindEmojiPicker } from '/emoji.js';
import { notificationButton, refreshNotifications, toggleNotifications, forgetNotifications } from '/push.js';
import { createAudioCalls } from '/calls.js';

const vocabulary = {
  uk: {
    loading: 'Завантаження…', newChat: 'Новий чат', direct: 'Особистий чат', group: 'Приватна група', find: 'Знайти', searchHint: 'Ім’я або @username', searchEmpty: 'Введи щонайменше 2 символи для пошуку.', noUsers: 'Користувачів не знайдено.', request: 'Надіслати запит', select: 'Обрати', selected: 'Обрано', title: 'Назва', createGroup: 'Створити групу', invite: 'Запросити', accept: 'Прийняти', reject: 'Відхилити', pending: 'Запит на спілкування', waiting: 'Очікуємо згоди співрозмовника.', invited: 'Тебе запросили до цієї розмови. Повідомлення стануть доступними після прийняття.', noMessages: 'Поки немає повідомлень. Напиши першим.', message: 'Повідомлення', send: 'Надіслати', encrypted: 'Зашифрована розмова', safety: 'Коди безпеки', safetyHint: 'Порівняй ці коди зі співрозмовниками через інший канал. Перше отримання ключа саме по собі не підтверджує особу.', block: 'Заблокувати', unblock: 'Розблокувати', blocked: 'Особисті повідомлення заблоковано.', leave: 'Вийти з групи', report: 'Поскаржитися', description: 'Опис проблеми', reportHint: 'До скарги передається лише твій опис. Повідомлення не додаються.', reportSaved: 'Опис скарги збережено.', older: 'Попередні повідомлення', invalidMessage: 'Не вдалося перевірити або розшифрувати повідомлення.',
    recovery: 'Код відновлення', recoveryHint: 'Збережи цей код у надійному місці. Він відновлює ключі та історію на іншому пристрої; сервер його не отримує.', download: 'Завантажити код', savedCode: 'Я зберіг код', locked: 'Розблокуй приватні дані', lockedHint: 'У цьому браузері немає твоїх ключів. Введи збережений код відновлення.', unlock: 'Розблокувати', privateReady: 'Приватні повідомлення шифруються у браузері.', codeMissing: 'Без коду або пристрою з ключами відновити приватні дані неможливо.',
    newChannel: 'Створити канал', topic: 'Тема', about: 'Опис', all: 'Усі теми', follow: 'Підписатися', unfollow: 'Відписатися', followers: 'підписників', publish: 'Опублікувати', post: 'Публічний допис', publicHint: 'Цей контент видимий іншим користувачам і не є приватним чатом.', noChannels: 'Каналів поки немає. Створи перший.', noPosts: 'Тут поки немає дописів.', back: 'Назад', refresh: 'Оновити', like: 'Подобається', unlike: 'Прибрати вподобання', comments: 'Коментарі', comment: 'Написати коментар', delete: 'Видалити',
    date: 'Дата', time: 'Час', event: 'Назва події або завдання', addPlan: 'Додати до календаря', noPlans: 'На цей день планів немає.', complete: 'Виконано', incomplete: 'Позначити виконаним', habitName: 'Нова звичка', addHabit: 'Додати звичку', noHabits: 'Додай першу звичку.', streak: 'днів поспіль', privateSpace: 'Назви планів і звичок зашифровані. Дати й позначки виконання — службові дані.',
    errors: { keys_required: 'Спочатку налаштуй ключі.', keys_locked: 'Введи код відновлення для розблокування.', key_changed: 'Ключ змінився. Зупинено передачу: перевір код безпеки.', secure_context_required: 'Для шифрування потрібен localhost або HTTPS.', invalid_recipient: 'Користувач недоступний або ще не налаштував ключі.', invitation_required: 'Потрібно прийняти запрошення.', messaging_not_allowed: 'Надсилання в цій розмові недоступне.', members_changed: 'Склад групи змінився. Перевір учасників і надішли ще раз.', user_blocked: 'Спілкування з цим користувачем заблоковано.', owner_required: 'Дія доступна лише власнику.', invalid_text: 'Перевір текст і його довжину.', invalid_title: 'Назва має містити 1–80 символів.', invalid_date: 'Перевір дату.', invalid_time: 'Перевір час.', group_full: 'У MVP група підтримує до 25 учасників.', already_invited: 'Запрошення вже існує.', cannot_leave: 'Власник не може залишити групу в цій версії.', invalid_payload: 'Не вдалося перевірити вміст.', encrypted_payload_required: 'Потрібні зашифровані дані.', record_not_found: 'Запис недоступний.', chat_not_found: 'Розмова недоступна.', invalid_key: 'Не вдалося перевірити ключі.' },
  },
  en: {
    loading: 'Loading…', newChat: 'New chat', direct: 'Direct chat', group: 'Private group', find: 'Find', searchHint: 'Name or @username', searchEmpty: 'Enter at least 2 characters to search.', noUsers: 'No users found.', request: 'Send request', select: 'Select', selected: 'Selected', title: 'Title', createGroup: 'Create group', invite: 'Invite', accept: 'Accept', reject: 'Decline', pending: 'Chat request', waiting: 'Waiting for the other person to accept.', invited: 'You have been invited. Messages become available once you accept.', noMessages: 'No messages yet. Say hello.', message: 'Message', send: 'Send', encrypted: 'Encrypted conversation', safety: 'Security codes', safetyHint: 'Compare these codes through another channel. Receiving a key for the first time does not verify the person.', block: 'Block', unblock: 'Unblock', blocked: 'Direct messages are blocked.', leave: 'Leave group', report: 'Report', description: 'Description', reportHint: 'Only your description is submitted. Messages are not included.', reportSaved: 'Report description saved.', older: 'Earlier messages', invalidMessage: 'Cannot verify or decrypt this message.',
    recovery: 'Recovery code', recoveryHint: 'Keep this code somewhere safe. It restores your keys and history on another device; the server does not receive it.', download: 'Download code', savedCode: 'I saved the code', locked: 'Unlock your private data', lockedHint: 'This browser does not have your keys. Enter your saved recovery code.', unlock: 'Unlock', privateReady: 'Private messages are encrypted in your browser.', codeMissing: 'Without the code or a device holding your keys, private data cannot be restored.',
    newChannel: 'Create channel', topic: 'Topic', about: 'Description', all: 'All topics', follow: 'Follow', unfollow: 'Unfollow', followers: 'followers', publish: 'Publish', post: 'Public post', publicHint: 'This content is visible to other users and is not a private chat.', noChannels: 'No channels yet. Create the first one.', noPosts: 'No posts yet.', back: 'Back', refresh: 'Refresh', like: 'Like', unlike: 'Unlike', comments: 'Comments', comment: 'Write a comment', delete: 'Delete',
    date: 'Date', time: 'Time', event: 'Event or task title', addPlan: 'Add to calendar', noPlans: 'Nothing planned for this day.', complete: 'Completed', incomplete: 'Mark as completed', habitName: 'New habit', addHabit: 'Add habit', noHabits: 'Add your first habit.', streak: 'day streak', privateSpace: 'Plan and habit names are encrypted. Dates and completion marks are service metadata.',
    errors: { keys_required: 'Set up your keys first.', keys_locked: 'Enter your recovery code to unlock.', key_changed: 'Key changed. Sending stopped: verify the security code.', secure_context_required: 'Encryption requires localhost or HTTPS.', invalid_recipient: 'User is unavailable or has not set up keys.', invitation_required: 'Accept the invitation first.', messaging_not_allowed: 'Messaging is unavailable in this conversation.', members_changed: 'Group membership changed. Check members and send again.', user_blocked: 'Communication with this user is blocked.', owner_required: 'Only the owner can do this.', invalid_text: 'Check the text and its length.', invalid_title: 'Title must be 1–80 characters.', invalid_date: 'Check the date.', invalid_time: 'Check the time.', group_full: 'MVP groups support up to 25 participants.', already_invited: 'An invitation already exists.', cannot_leave: 'Owners cannot leave groups in this version.', invalid_payload: 'Cannot verify the content.', encrypted_payload_required: 'Encrypted data is required.', record_not_found: 'Record is unavailable.', chat_not_found: 'Conversation is unavailable.', invalid_key: 'Cannot verify keys.' },
  },
};
function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function streak(dates) {
  const completed = new Set(dates);
  const day = new Date();
  if (!completed.has(localDate(day))) day.setDate(day.getDate() - 1);
  let count = 0;
  while (completed.has(localDate(day))) { count += 1; day.setDate(day.getDate() - 1); }
  return count;
}

export function createMvp({ api, getState, escapeHTML: e, icon, text: appText, toast, renderShell }) {
  const s = { chats: [], selectedChat: null, messages: [], hasMore: false, channels: [], selectedChannel: null, posts: [], feeds: { forYou: [], subscriptions: [] }, plans: [], habits: [], day: localDate(), topic: '', query: '', cryptoStatus: 'loading', recoveryCode: null, selectedUsers: [], users: [], searchQuery: '', newMode: 'direct', groupTitle: '', inviteChat: null };
  const drafts = new Map();
  const decrypted = new Map();
  let epoch = 0, pollTimer, polling = false;
  const calls = createAudioCalls({ api, getState, encryption, escapeHTML:e, toast });
  const dialog = document.createElement('dialog');
  dialog.id = 'mvp-dialog';
  dialog.setAttribute('aria-labelledby', 'mvp-dialog-title');
  document.body.append(dialog);
  const t = key => vocabulary[getState().language][key] ?? appText(key);
  const selected = () => s.chats.find(chat => chat.id === s.selectedChat);
  const chatName = chat => chat.type === 'group' ? chat.title : chat.members.find(member => member.id !== getState().user.id)?.name ?? t('direct');
  const errorText = error => vocabulary[getState().language].errors[error.code ?? error.message] ?? (error.status ? error.message : getState().language === 'uk' ? 'Не вдалося виконати дію. Перевір дані або код відновлення.' : 'Action failed. Check the data or recovery code.');
  async function request(route, options) {
    try { return await api(`mvp/${route}`, options); }
    catch (error) {
      if (error.message === appText('unavailable')) throw error;
      throw error;
    }
  }
  const actionButton = (action, title, extra = '', style = 'secondary') => `<button type="button" class="button ${style}" data-mvp="${action}" ${extra}>${e(t(title))}</button>`;
  function redraw() { if (getState().user) renderShell(); }
  function openDialog(title, body) {
    if (dialog.open) dialog.close();
    dialog.innerHTML = `<div class="dialog-heading"><h2 id="mvp-dialog-title">${e(title)}</h2><button class="icon-button" data-mvp="close" aria-label="${e(appText('close'))}">${icon('close')}</button></div>${body}<p class="mvp-error form-error" role="alert" hidden></p>`;
    dialog.showModal();
    syncBusyControls();
  }
  function privateLock() {
    return `<section class="section-empty"><span class="empty-icon">${icon('chat')}</span><h1>${e(t(s.cryptoStatus === 'loading' ? 'loading' : 'locked'))}</h1><p>${e(t('lockedHint'))}</p>${actionButton('unlock-dialog', 'unlock', '', 'primary')}<p class="field-note">${e(t('codeMissing'))}</p></section>`;
  }
  async function personalRecords(items, kind) {
    if (!encryption.unlocked()) return [];
    return Promise.all(items.map(async item => {
      const cached = decrypted.get(item.id);
      try {
        const payload = cached?.ciphertext === item.ciphertext ? cached.value : await encryption.decryptEnvelope(item.ciphertext, encryption.ownIdentity(), { kind, id: item.id });
        if (typeof payload.title !== 'string' || payload.title.length > 200) throw new Error('invalid_payload');
        decrypted.set(item.id, { ciphertext: item.ciphertext, value: payload });
        return { ...item, title: payload.title };
      } catch { return { ...item, title: t('invalidMessage'), failed: true }; }
    }));
  }
  async function refreshData() {
    const generation = epoch;
    const results = await Promise.all([request('chats'), request('channels'), request('feed'), request('feed?mode=following'), request('plans'), request('habits')]);
    if (generation !== epoch || !getState().user) return;
    s.chats = results[0].chats;
    s.channels = results[1].channels;
    s.feeds.forYou = results[2].posts;
    s.feeds.subscriptions = results[3].posts;
    s.plans = await personalRecords(results[4].plans, 'plan');
    s.habits = await personalRecords(results[5].habits, 'habit');
    if (s.selectedChannel) s.posts = (await request(`channels/${s.selectedChannel}`)).posts;
  }
  async function readMessages({ older = false } = {}) {
    const chat = selected();
    if (!chat || chat.myStatus !== 'accepted' || !encryption.unlocked()) return;
    const generation = epoch;
    const id = chat.id;
    const first = s.messages[0]?.seq;
    const last = s.messages.at(-1)?.seq;
    const query = older && first ? `?before=${first}` : last ? `?after=${last}` : '';
    const result = await request(`chats/${id}/messages${query}`);
    if (generation !== epoch || s.selectedChat !== id) return;
    s.chats = s.chats.map(item => item.id === id ? result.chat : item);
    const readTime = Number.isSafeInteger(result.serverTime) ? result.serverTime : Date.now();
    const retry = s.messages.filter(message => message.failed && (message.retryAfter ?? 0) <= readTime);
    const pending = [...new Map([...retry, ...result.messages].map(message => [message.id, message])).values()];
    const values = await Promise.all(pending.map(async message => {
      const cached = decrypted.get(message.id);
      try {
        const sender = result.chat.members.find(member => member.id === message.senderId);
        if (!sender) throw new Error('invalid_signature');
        const payload = cached?.ciphertext === message.ciphertext ? cached.value : await encryption.decryptEnvelope(message.ciphertext, sender, { kind: 'message', id: message.id, chatId: message.chatId, senderId: message.senderId }, result.serverTime);
        if (typeof payload.text !== 'string' || payload.text.length > 4000) throw new Error('invalid_payload');
        decrypted.set(message.id, { ciphertext: message.ciphertext, value: payload });
        return { ...message, text: payload.text, senderName: sender.name, failed: false };
      } catch { return { ...message, text: t('invalidMessage'), senderName: '', failed: true, retryAfter: readTime + 10_000 }; }
    }));
    if (generation !== epoch || s.selectedChat !== id) return;
    s.messages = [...new Map([...s.messages, ...values].map(message => [message.id, message])).values()].sort((a, b) => a.seq - b.seq);
    if (!last || older) s.hasMore = result.hasMore;
  }
  function messagesHTML() {
    if (!s.messages.length) return `<p class="conversation-empty">${e(t('noMessages'))}</p>`;
    return s.messages.map(message => `<article class="message-row ${message.senderId === getState().user.id ? 'mine' : ''} ${message.failed ? 'message-failed' : ''}"><div class="message-bubble">${selected()?.type === 'group' && message.senderId !== getState().user.id ? `<strong class="message-author">${e(message.senderName)}</strong>` : ''}<p>${e(message.text)}</p><time>${e(new Intl.DateTimeFormat(getState().language, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(message.createdAt)))}</time></div></article>`).join('');
  }
  async function poll() {
    if (polling || !getState().user || getState().busy) return;
    polling = true;
    const generation = epoch;
    try {
      const old = selected();
      const oldState = old ? `${old.revision}:${old.myStatus}:${old.ready}:${old.blocked}` : null;
      const result = await request('chats');
      if (generation !== epoch || !getState().user) return;
      s.chats = result.chats;
      const sidebar = document.querySelector('#mvp-chat-list');
      if (sidebar) sidebar.innerHTML = sidebarHTML();
      const current = selected();
      if (old && !current) { s.selectedChat = null; s.messages = []; if (!dialog.open) redraw(); return; }
      if (current && getState().view === 'chats' && encryption.unlocked()) {
        const oldMessages = s.messages.map(message => `${message.id}:${Boolean(message.failed)}`).join(',');
        await readMessages();
        if (generation !== epoch) return;
        const newState = `${current.revision}:${current.myStatus}:${current.ready}:${current.blocked}`;
        if (oldState !== newState && !dialog.open) redraw();
        else if (s.messages.map(message => `${message.id}:${Boolean(message.failed)}`).join(',') !== oldMessages) {
          const list = document.querySelector('#mvp-messages');
          if (list) { list.innerHTML = messagesHTML(); list.scrollTop = list.scrollHeight; }
        }
      }
    } catch (error) { if (error.status === 401) clearInterval(pollTimer); }
    finally { polling = false; }
  }
  function sidebarHTML() {
    return s.chats.map(chat => `<button class="chat-item ${chat.id === s.selectedChat && getState().view === 'chats' ? 'selected' : ''}" data-mvp="open-chat" data-id="${chat.id}"><span class="chat-avatar">${icon(chat.type === 'group' ? 'people' : 'chat')}</span><span><strong>${e(chatName(chat))}</strong><small>${e(chat.myStatus === 'invited' ? t('pending') : chat.type === 'group' ? t('group') : t('direct'))}</small></span>${chat.myStatus === 'invited' ? '<span class="request-dot" aria-label="Request"></span>' : ''}</button>`).join('');
  }
  function renderChat() {
    if (!encryption.unlocked()) return privateLock();
    const chat = selected();
    if (!chat) return `<section class="chat-welcome"><div class="greeting">${e(appText('hello'))}, ${e(getState().user.personalName)}</div><span class="logo welcome-logo"><img src="/logo.png" alt="LelekaTalk"></span><h1>${e(appText('homeTitle'))}</h1><p>${e(appText('homeHint'))}</p><div class="welcome-actions">${actionButton('new-chat', 'newChat', '', 'primary')}<button class="button secondary" data-view="communities">${e(appText('discoverAction'))}</button></div></section>`;
    const invited = chat.myStatus === 'invited';
    const disabled = invited || !chat.ready || chat.blocked;
    return `<section class="conversation"><header class="conversation-header"><div><h1>${e(chatName(chat))}</h1><p>${e(t('encrypted'))}${chat.type === 'group' ? ` · ${chat.members.filter(member => member.status === 'accepted').length}` : ''}</p></div><div class="conversation-tools">${calls.button(chat)}${actionButton('safety', 'safety', '', 'secondary')}${chat.type === 'group' && chat.ownerId === getState().user.id ? actionButton('invite', 'invite') : ''}${chat.type === 'group' && chat.ownerId !== getState().user.id && !invited ? actionButton('leave', 'leave') : ''}${chat.type === 'direct' && !invited ? actionButton(chat.blockedByMe ? 'unblock' : 'block', chat.blockedByMe ? 'unblock' : 'block') : ''}${actionButton('report', 'report')}</div></header>
      ${invited ? `<div class="invitation-panel"><p>${e(t('invited'))}</p>${actionButton('accept', 'accept', '', 'primary')}${actionButton('reject', 'reject')}</div>` : ''}
      ${!invited && !chat.ready ? `<p class="status-note">${e(t('waiting'))}</p>` : ''}${chat.blocked ? `<p class="status-note">${e(t('blocked'))}</p>` : ''}
      ${s.hasMore ? actionButton('older', 'older', '', 'secondary') : ''}<div id="mvp-messages" class="messages" role="log" aria-live="polite">${messagesHTML()}</div>
      <form id="mvp-message-form" class="message-composer"><textarea name="message" aria-label="${e(t('message'))}" placeholder="${e(t('message'))}" maxlength="4000" rows="1" required ${disabled ? 'disabled' : ''}></textarea><button class="send-button" type="submit" aria-label="${e(t('send'))}" ${disabled ? 'disabled' : ''}>${icon('arrow')}</button></form></section>`;
  }
  function postsHTML(posts) {
    if (!posts.length) return `<p class="empty-note">${e(t('noPosts'))}</p>`;
    return posts.map(post => `<article class="post-entry"><header><button class="channel-link" data-mvp="open-channel" data-id="${post.channel.id}">${e(post.channel.title)}</button><span>${e(post.channel.creatorName)} · ${e(new Intl.DateTimeFormat(getState().language, { day: 'numeric', month: 'short' }).format(new Date(post.createdAt)))}</span></header><p class="post-text">${e(post.text)}</p><div class="post-actions"><button class="button secondary small" data-mvp="like" data-id="${post.id}" data-liked="${post.liked}" aria-pressed="${post.liked}">${e(t(post.liked ? 'unlike' : 'like'))} · ${post.likes}</button>${post.channel.isOwner ? actionButton('delete-post', 'delete', `data-id="${post.id}"`, 'secondary small') : ''}</div><details class="post-comments"><summary>${e(t('comments'))} · ${post.comments.length}</summary>${post.comments.map(comment => `<div class="comment-entry"><strong>${e(comment.authorName)}</strong><p>${e(comment.text)}</p></div>`).join('')}<form class="mvp-comment-form" data-post-id="${post.id}"><input name="comment" aria-label="${e(t('comment'))}" placeholder="${e(t('comment'))}" maxlength="2000" required><button class="button secondary small" type="submit">${e(t('send'))}</button></form></details></article>`).join('');
  }
  function renderFeed() {
    const mode = getState().feed;
    return `<section class="content-page"><div class="page-toolbar"><div class="segmented"><button data-feed="subscriptions" class="${mode === 'subscriptions' ? 'selected' : ''}">${e(appText('subscriptions'))}</button><button data-feed="forYou" class="${mode === 'forYou' ? 'selected' : ''}">${e(appText('forYou'))}</button></div>${actionButton('refresh', 'refresh')}</div>${postsHTML(s.feeds[mode])}</section>`;
  }
  function renderChannels() {
    if (s.selectedChannel) {
      const channel = s.channels.find(channel => channel.id === s.selectedChannel);
      if (!channel) return `<p>${e(t('loading'))}</p>`;
      return `<section class="content-page"><div class="page-toolbar">${actionButton('back-channels', 'back')}${actionButton('follow', channel.following ? 'unfollow' : 'follow', `data-id="${channel.id}" data-following="${channel.following}"`, channel.following ? 'secondary' : 'primary')}</div><div class="channel-heading"><h1>${e(channel.title)}</h1><p>${e(channel.description)}</p><small>${e(channel.creatorName)} · ${channel.followers} ${e(t('followers'))}${channel.personalUsername ? ` · @${e(channel.personalUsername)}` : ''}</small></div>${channel.isOwner ? `<form id="mvp-post-form" class="post-compose"><label>${e(t('post'))}<textarea name="text" aria-label="${e(t('post'))}" rows="4" maxlength="5000" required></textarea></label><p class="field-note">${e(t('publicHint'))}</p><button class="button primary" type="submit">${e(t('publish'))}</button></form>` : ''}${postsHTML(s.posts)}</section>`;
    }
    const channels = s.channels.filter(channel => (!s.topic || channel.topic === s.topic) && (!s.query || channel.title.toLowerCase().includes(s.query.toLowerCase())));
    return `<section class="content-page"><div class="page-toolbar"><h1>${e(appText('communities'))}</h1>${actionButton('create-channel', 'newChannel', '', 'primary')}</div><form id="mvp-channel-search" class="inline-form"><input name="query" aria-label="${e(appText('communities'))}" placeholder="${e(appText('communities'))}" value="${e(s.query)}"><button class="button secondary" type="submit">${e(t('find'))}</button></form><div class="topic-tabs">${['', 'creative', 'technology', 'learning', 'life'].map(topic => `<button class="topic-button ${s.topic === topic ? 'active' : ''}" data-mvp="topic" data-topic="${topic}">${e(topic ? appText(topic) : t('all'))}</button>`).join('')}</div><div class="channel-list">${channels.length ? channels.map(channel => `<article class="channel-entry"><button data-mvp="open-channel" data-id="${channel.id}"><span class="feature-icon">${icon('people')}</span><span><strong>${e(channel.title)}</strong><p>${e(channel.description)}</p><small>${e(channel.creatorName)} · ${channel.followers} ${e(t('followers'))}</small></span></button>${actionButton('follow', channel.following ? 'unfollow' : 'follow', `data-id="${channel.id}" data-following="${channel.following}"`, 'secondary small')}</article>`).join('') : `<p class="empty-note">${e(t('noChannels'))}</p>`}</div></section>`;
  }
  function renderSpace() {
    if (!encryption.unlocked()) return privateLock();
    const week = Array.from({ length: 7 }, (_, index) => { const day = new Date(); day.setDate(day.getDate() - 6 + index); return { value: localDate(day), label: new Intl.DateTimeFormat(getState().language, { weekday: 'short', day: 'numeric' }).format(day) }; });
    const plans = s.plans.filter(plan => plan.date === s.day).sort((a, b) => a.time.localeCompare(b.time));
    return `<section class="content-page personal-space"><h1>${e(appText('space'))}</h1><p class="field-note">${e(t('privateSpace'))}</p><div class="space-columns"><section><div class="space-section-title"><h2>${e(appText('calendar'))}</h2><input type="date" id="mvp-selected-date" aria-label="${e(t('date'))}" value="${s.day}"></div><form id="mvp-plan-form" class="space-form"><input name="title" aria-label="${e(t('event'))}" placeholder="${e(t('event'))}" maxlength="200" required><div class="inline-form"><input type="time" name="time" aria-label="${e(t('time'))}"><button class="button primary" type="submit">${e(t('addPlan'))}</button></div></form><div class="plan-list">${plans.length ? plans.map(plan => `<article class="plan-entry ${plan.done ? 'done' : ''}"><button class="complete-button" data-mvp="toggle-plan" data-id="${plan.id}" data-done="${plan.done}" aria-label="${e(t(plan.done ? 'complete' : 'incomplete'))}" aria-pressed="${plan.done}">${icon('check')}</button><span><strong>${e(plan.title)}</strong><small>${e(plan.time)}</small></span><button class="icon-button" data-mvp="delete-plan" data-id="${plan.id}" aria-label="${e(t('delete'))}">${icon('close')}</button></article>`).join('') : `<p class="empty-note">${e(t('noPlans'))}</p>`}</div></section><section><h2>${e(appText('habits'))}</h2><form id="mvp-habit-form" class="inline-form"><input name="title" aria-label="${e(t('habitName'))}" placeholder="${e(t('habitName'))}" maxlength="200" required><button class="button primary" type="submit">${e(t('addHabit'))}</button></form><div class="habit-list">${s.habits.length ? s.habits.map(habit => `<article class="habit-entry"><header><div><strong>${e(habit.title)}</strong><small>${streak(habit.completedDates)} ${e(t('streak'))}</small></div><button class="icon-button" data-mvp="delete-habit" data-id="${habit.id}" aria-label="${e(t('delete'))}">${icon('close')}</button></header><div class="habit-week">${week.map(day => `<button class="habit-day ${habit.completedDates.includes(day.value) ? 'complete' : ''}" data-mvp="habit-day" data-id="${habit.id}" data-date="${day.value}" data-completed="${habit.completedDates.includes(day.value)}" aria-pressed="${habit.completedDates.includes(day.value)}">${e(day.label)}</button>`).join('')}</div></article>`).join('') : `<p class="empty-note">${e(t('noHabits'))}</p>`}</div></section></div></section>`;
  }
  function newChatDialog() {
    openDialog(s.inviteChat ? t('invite') : t('newChat'), `<div class="segmented">${s.inviteChat ? '' : ['direct', 'group'].map(mode => `<button type="button" data-mvp="new-mode" data-mode="${mode}" class="${s.newMode === mode ? 'selected' : ''}">${e(t(mode))}</button>`).join('')}</div>${s.newMode === 'group' && !s.inviteChat ? `<label>${e(t('title'))}<input id="mvp-group-title" aria-label="${e(t('title'))}" value="${e(s.groupTitle)}" maxlength="80" required></label>` : ''}<form id="mvp-user-search" class="inline-form"><input name="query" aria-label="${e(t('searchHint'))}" placeholder="${e(t('searchHint'))}" value="${e(s.searchQuery)}" required minlength="2"><button class="button secondary" type="submit">${e(t('find'))}</button></form><div class="user-results">${s.users.length ? s.users.map(user => `<div class="user-result"><span><strong>${e(user.name)}</strong><small>@${e(user.username)}</small></span><button class="button small ${s.selectedUsers.some(item => item.id === user.id) ? 'primary' : 'secondary'}" data-mvp="select-user" data-id="${user.id}">${e(t(s.newMode === 'group' && !s.inviteChat ? s.selectedUsers.some(item => item.id === user.id) ? 'selected' : 'select' : s.inviteChat ? 'invite' : 'request'))}</button></div>`).join('') : `<p class="empty-note">${e(t(s.searchQuery ? 'noUsers' : 'searchEmpty'))}</p>`}</div>${s.newMode === 'group' && !s.inviteChat ? `<p class="field-note">${e(s.selectedUsers.map(user => user.name).join(', '))}</p>${actionButton('create-group', 'createGroup', s.selectedUsers.length ? '' : 'disabled', 'primary')}` : ''}`);
    dialog.querySelector('#mvp-user-search').addEventListener('submit', event => { event.preventDefault(); run(async () => { s.searchQuery = new FormData(event.target).get('query').trim(); s.groupTitle = dialog.querySelector('#mvp-group-title')?.value ?? s.groupTitle; s.users = (await request(`users?q=${encodeURIComponent(s.searchQuery)}`)).users; newChatDialog(); }); });
    dialog.querySelector('#mvp-group-title')?.addEventListener('input', event => { s.groupTitle = event.target.value; });
  }
  function syncBusyControls() {
    if (getState().busy) {
      for (const button of document.querySelectorAll('button[data-action], button[data-view], button[data-feed], [data-mvp]:not([data-mvp="close"]), form[id^="mvp-"] button[type="submit"], .mvp-comment-form button[type="submit"]')) {
        if (!button.disabled) { button.dataset.mvpBusy = 'true'; button.disabled = true; }
      }
    } else {
      for (const button of document.querySelectorAll('[data-mvp-busy]')) { button.disabled = false; delete button.dataset.mvpBusy; }
    }
  }
  async function run(operation) {
    if (getState().busy || !getState().user) return;
    getState().busy = true;
    syncBusyControls();
    try { await operation(); }
    catch (error) {
      const element = dialog.open ? dialog.querySelector('.mvp-error') : null;
      if (element) { element.textContent = errorText(error); element.hidden = false; } else toast(errorText(error));
    } finally { getState().busy = false; syncBusyControls(); }
  }
  async function refreshAndRender() { await refreshData(); redraw(); }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-mvp]');
    if (!button || button.disabled || !getState().user) return;
    const action = button.dataset.mvp;
    if (action === 'close') { dialog.close(); return; }
    run(async () => {
      const id = button.dataset.id;
      if (action === 'notifications') { try { await toggleNotifications(api, getState().language); } finally { redraw(); } }
      else if (action === 'new-chat' || action === 'invite') {
        s.users = []; s.selectedUsers = []; s.searchQuery = ''; s.groupTitle = ''; s.newMode = 'direct'; s.inviteChat = action === 'invite' ? s.selectedChat : null; newChatDialog();
      } else if (action === 'new-mode') { s.newMode = button.dataset.mode; newChatDialog(); }
      else if (action === 'select-user') {
        const user = s.users.find(user => user.id === id);
        if (s.newMode === 'group' && !s.inviteChat) { s.selectedUsers = s.selectedUsers.some(item => item.id === id) ? s.selectedUsers.filter(item => item.id !== id) : [...s.selectedUsers, user]; newChatDialog(); }
        else {
          const result = s.inviteChat ? await request(`chats/${s.inviteChat}/invite`, { method: 'POST', body: { userId: id } }) : await request('chats', { method: 'POST', body: { type: 'direct', userId: id } });
          s.selectedChat = result.chat.id; s.messages = []; s.hasMore = false; getState().view = 'chats'; dialog.close(); await refreshAndRender(); await readMessages(); redraw();
        }
      } else if (action === 'create-group') {
        const result = await request('chats', { method: 'POST', body: { type: 'group', title: s.groupTitle, userIds: s.selectedUsers.map(user => user.id) } });
        s.selectedChat = result.chat.id; s.messages = []; s.hasMore = false; getState().view = 'chats'; dialog.close(); await refreshAndRender();
      } else if (action === 'open-chat') { s.selectedChat = id; s.messages = []; s.hasMore = false; getState().view = 'chats'; await readMessages(); redraw(); }
      else if (['accept', 'reject', 'block', 'unblock', 'leave'].includes(action)) {
        await request(`chats/${s.selectedChat}/${action}`, { method: 'POST' });
        if (action === 'reject' || action === 'leave') { s.selectedChat = null; s.messages = []; }
        await refreshData(); await readMessages(); redraw();
      } else if (action === 'older') { await readMessages({ older: true }); redraw(); }
      else if (action === 'safety') {
        openDialog(t('safety'), `<p class="field-note">${e(t('safetyHint'))}</p>${selected().members.filter(member => member.status === 'accepted').map(member => `<div class="security-entry"><strong>${e(member.name)}</strong><code>${e(encryption.fingerprint(member))}</code></div>`).join('')}`);
      } else if (action === 'report') {
        openDialog(t('report'), `<p class="field-note">${e(t('reportHint'))}</p><form id="mvp-report-form"><label>${e(t('description'))}<textarea name="description" aria-label="${e(t('description'))}" maxlength="2000" rows="5" required></textarea></label><button class="button primary" type="submit">${e(t('send'))}</button></form>`);
        dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); run(async () => { await request('reports', { method: 'POST', body: { chatId: s.selectedChat, description: new FormData(event.target).get('description') } }); dialog.close(); toast(t('reportSaved')); }); });
      } else if (action === 'saved-code') { s.recoveryCode = null; redraw(); }
      else if (action === 'download-code') {
        const file = new Blob([`LelekaTalk @${getState().user.username}\n${s.recoveryCode}\n`], { type: 'text/plain' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = 'LelekaTalk-recovery.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      } else if (action === 'unlock-dialog') {
        openDialog(t('locked'), `<p class="field-note">${e(t('lockedHint'))}</p><form id="mvp-unlock-form"><label>${e(t('recovery'))}<input name="code" aria-label="${e(t('recovery'))}" autocomplete="off" required></label><button class="button primary" type="submit">${e(t('unlock'))}</button></form><p class="field-note">${e(t('codeMissing'))}</p>`);
        dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); run(async () => { await encryption.unlock(new FormData(event.target).get('code')); s.cryptoStatus = 'ready'; dialog.close(); await refreshData(); await readMessages(); redraw(); }); });
      } else if (action === 'create-channel') {
        openDialog(t('newChannel'), `<form id="mvp-channel-form"><label>${e(t('title'))}<input name="title" aria-label="${e(t('title'))}" maxlength="80" required></label><label>${e(t('about'))}<textarea name="description" aria-label="${e(t('about'))}" rows="3" maxlength="500"></textarea></label><label>${e(t('topic'))}<select name="topic" aria-label="${e(t('topic'))}">${['creative', 'technology', 'learning', 'life'].map(topic => `<option value="${topic}">${e(appText(topic))}</option>`).join('')}</select></label><p class="field-note">${e(t('publicHint'))}</p><button class="button primary" type="submit">${e(t('newChannel'))}</button></form>`);
        dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); run(async () => { const result = await request('channels', { method: 'POST', body: Object.fromEntries(new FormData(event.target)) }); s.selectedChannel = result.channel.id; dialog.close(); await refreshAndRender(); }); });
      } else if (action === 'open-channel') { s.selectedChannel = id; getState().view = 'communities'; await refreshAndRender(); }
      else if (action === 'back-channels') { s.selectedChannel = null; await refreshAndRender(); }
      else if (action === 'topic') { s.topic = button.dataset.topic; redraw(); }
      else if (action === 'follow') { await request(`channels/${id}/follow`, { method: 'POST', body: { following: button.dataset.following !== 'true' } }); await refreshAndRender(); }
      else if (action === 'like') { await request(`posts/${id}/like`, { method: 'POST', body: { liked: button.dataset.liked !== 'true' } }); await refreshAndRender(); }
      else if (action === 'delete-post') { await request(`posts/${id}`, { method: 'DELETE' }); await refreshAndRender(); }
      else if (action === 'refresh') { await refreshAndRender(); }
      else if (action === 'toggle-plan') { await request(`plans/${id}`, { method: 'PATCH', body: { done: button.dataset.done !== 'true' } }); await refreshAndRender(); }
      else if (action === 'delete-plan' || action === 'delete-habit') { await request(`${action === 'delete-plan' ? 'plans' : 'habits'}/${id}`, { method: 'DELETE' }); await refreshAndRender(); }
      else if (action === 'habit-day') { await request(`habits/${id}`, { method: 'PATCH', body: { date: button.dataset.date, completed: button.dataset.completed !== 'true' } }); await refreshAndRender(); }
    });
  });
  function bind() {
    document.querySelectorAll('[data-audio-call]').forEach(button=>button.addEventListener('click',()=>{const chat=s.chats.find(c=>c.id===button.dataset.audioCall);if(chat)void calls.dial(chat);}));
    const form = document.querySelector('#mvp-message-form');
    if (form) {
      const field = form.querySelector('textarea');
      bindEmojiPicker(form, getState().language);
      field.value = drafts.get(s.selectedChat) ?? '';
      field.addEventListener('input', () => { drafts.set(s.selectedChat, field.value); });
      field.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
      form.addEventListener('submit', event => { event.preventDefault(); run(async () => {
        const chat = selected();
        const content = field.value.trim();
        if (!content || content.length > 4000) throw new Error('invalid_text');
        const id = crypto.randomUUID();
        const envelope = { kind: 'message', id, chatId: chat.id, senderId: getState().user.id, text: content };
        const ciphertext = await encryption.encryptEnvelope(envelope, chat.members.filter(member => member.status === 'accepted'));
        await request(`chats/${chat.id}/messages`, { method: 'POST', body: { id, ciphertext, revision: chat.revision } });
        drafts.delete(chat.id); decrypted.set(id, { ciphertext, value: envelope }); await readMessages(); await refreshData(); redraw();
      }); });
      const list = document.querySelector('#mvp-messages');
      if (list) list.scrollTop = list.scrollHeight;
    }
    document.querySelector('#mvp-channel-search')?.addEventListener('submit', event => { event.preventDefault(); s.query = new FormData(event.target).get('query').trim(); run(refreshAndRender); });
    document.querySelector('#mvp-post-form')?.addEventListener('submit', event => { event.preventDefault(); run(async () => { await request(`channels/${s.selectedChannel}/posts`, { method: 'POST', body: { text: new FormData(event.target).get('text') } }); await refreshAndRender(); }); });
    document.querySelectorAll('.mvp-comment-form').forEach(form => form.addEventListener('submit', event => { event.preventDefault(); run(async () => { await request(`posts/${form.dataset.postId}/comments`, { method: 'POST', body: { text: new FormData(form).get('comment') } }); await refreshAndRender(); }); }));
    document.querySelector('#mvp-selected-date')?.addEventListener('change', event => { s.day = event.target.value || localDate(); redraw(); });
    document.querySelector('#mvp-plan-form')?.addEventListener('submit', event => { event.preventDefault(); run(async () => {
      const fields = new FormData(event.target);
      const title = fields.get('title').trim();
      if (!title || title.length > 200) throw new Error('invalid_text');
      const id = crypto.randomUUID();
      const ciphertext = await encryption.encryptEnvelope({ kind: 'plan', id, title });
      await request('plans', { method: 'POST', body: { id, date: s.day, time: fields.get('time'), ciphertext } }); await refreshAndRender();
    }); });
    document.querySelector('#mvp-habit-form')?.addEventListener('submit', event => { event.preventDefault(); run(async () => {
      const title = new FormData(event.target).get('title').trim();
      if (!title || title.length > 200) throw new Error('invalid_text');
      const id = crypto.randomUUID();
      const ciphertext = await encryption.encryptEnvelope({ kind: 'habit', id, title });
      await request('habits', { method: 'POST', body: { id, ciphertext } }); await refreshAndRender();
    }); });
    syncBusyControls();
  }
  return {
    notificationNotice: () => `<div class="notification-settings">${notificationButton(getState().language)}</div>`,
    syncBusyControls,
    refresh: () => run(refreshAndRender),
    sidebar: () => `<div id="mvp-chat-list" class="chat-list">${sidebarHTML()}</div>`,
    open: () => getState().view === 'chats' && Boolean(s.selectedChat),
    view: view => view === 'chats' ? renderChat() : view === 'feed' ? renderFeed() : view === 'communities' ? renderChannels() : view === 'space' ? renderSpace() : null,
    notice: () => s.recoveryCode ? `<div class="recovery-notice"><strong>${e(t('recovery'))}</strong><p>${e(t('recoveryHint'))}</p><code id="mvp-recovery-code">${e(s.recoveryCode)}</code><div>${actionButton('download-code', 'download')}${actionButton('saved-code', 'savedCode', '', 'primary')}</div></div>` : `<div class="build-note">${e(t(s.cryptoStatus === 'ready' ? 'privateReady' : s.cryptoStatus === 'loading' ? 'loading' : 'locked'))}${s.cryptoStatus === 'locked' ? actionButton('unlock-dialog', 'unlock', '', 'secondary small') : ''}</div>`,
    bind,
    async start(user) {
      clearInterval(pollTimer);
      const generation = ++epoch;
      s.chats = []; s.selectedChat = null; s.messages = []; s.channels = []; s.selectedChannel = null; s.posts = []; s.plans = []; s.habits = []; s.feeds = { forYou: [], subscriptions: [] }; s.cryptoStatus = 'loading'; s.recoveryCode = null;
      drafts.clear(); decrypted.clear(); redraw();
      try {
        const result = await encryption.openSession(user, api);
        if (generation !== epoch) return;
        s.cryptoStatus = result.locked ? 'locked' : 'ready'; s.recoveryCode = result.recoveryCode ?? null;
        await refreshData(); redraw();
        await refreshNotifications(api);
        if (generation !== epoch) return;
        const target = new URL(location.href).searchParams.get('chat');
        if (target && s.chats.some(chat => chat.id === target && chat.myStatus === 'accepted')) {
          s.selectedChat = target; getState().view = 'chats'; await readMessages();
          const url = new URL(location.href); url.searchParams.delete('chat'); history.replaceState(null, '', url.pathname + url.search + url.hash);
        }
        redraw();
        pollTimer = setInterval(poll, 2000);
        calls.start(user);
      } catch (error) { if (generation === epoch) { s.cryptoStatus = 'locked'; redraw(); toast(errorText(error)); } }
    },
    async stop(userId) { ++epoch; clearInterval(pollTimer); await calls.stop(); s.recoveryCode = null; drafts.clear(); decrypted.clear(); dialog.close(); await forgetNotifications().catch(() => {}); await encryption.closeSession(userId).catch(() => {}); },
    errorText,
  };
}
