import { createWall } from '/wall.js';
import { createMvp } from '/mvp.js';
const words = {
  uk: {
    supportTitle: 'Допоможи LelekaTalk зростати', supportHint: 'Твоя підтримка допомагає розвивати український месенджер.', supportButton: 'Підтримати проєкт', supportNewTab: 'Відкриється банка monobank у новій вкладці',
    tagline: 'Спілкуйся. Створюй. Будь собою.', intro: 'Твій простір для розмов, ідей та спільнот.',
    welcome: 'Раді бачити тебе', createAccount: 'Створи свій простір', login: 'Увійти', register: 'Створити акаунт',
    email: 'Email', password: 'Пароль', name: 'Твоє ім’я', username: 'Ім’я користувача',
    passwordHint: 'Щонайменше 12 символів', age: 'Мені виповнилося 16 років',
    noAccount: 'Ще немає акаунта?', hasAccount: 'Уже маєш акаунт?', working: 'Зачекай…',
    localNotice: 'MVP · підтвердження email ще не підключене',
    wall:'Моя стіна', chats: 'Чати', feed: 'Стрічка', communities: 'Спільноти', space: 'Мій простір', studio: 'Креативна студія', assistant: 'ШІ-помічник',
    subscriptions: 'Підписки', forYou: 'Для вас', personal: 'Особистий профіль', creator: 'Профіль креатора',
    newChat: 'Новий чат', search: 'Пошук розмов', noChats: 'Тут з’являться твої розмови', noChatsHint: 'Почни з налаштування свого профілю.',
    hello: 'Привіт', homeTitle: 'Розмови починаються тут', homeHint: 'Місце для близьких людей, спільних ідей і нових знайомств.',
    profileAction: 'Налаштувати профіль', discoverAction: 'Переглянути спільноти',
    foundation: 'Перша збірка: акаунти та профілі працюють. Чати, платежі й ШІ ще не підключені.',
    composeLater: 'Надсилання повідомлень буде доступне після підключення шифрування',
    feedTitle: 'Знайди те, що надихає', feedHint: 'Дописи, короткі відео та історії твоїх майбутніх улюблених авторів.',
    subscriptionsTitle: 'Твої автори — в одному місці', subscriptionsHint: 'Тут будуть публікації каналів, на які ти підпишешся.',
    communityTitle: 'Знайди своїх людей', communityHint: 'Спільноти за інтересами, розмови та простір для спільних ідей.',
    creative: 'Творчість', technology: 'Технології', learning: 'Навчання', life: 'Стиль життя',
    coming: 'Ця функція ще в розробці.', planned: 'Заплановано в PRD',
    spaceTitle: 'Більше місця для твого життя', spaceHint: 'Плануй день, розвивай звички та збирай ідеї.',
    calendar: 'Календар', calendarHint: 'Плани, події та важливі дати.', habits: 'Трекер звичок', habitsHint: 'Маленькі кроки до твоїх цілей.',
    studioTitle: 'Ідеї, які стають контентом', studioHint: 'Від першої чернетки до публікації — у твоєму творчому просторі.',
    drafts: 'Дописи й чернетки', draftsHint: 'Тексти, медіа та планування публікацій.',
    images: 'Зображення', imagesHint: 'Редагування та локальна ШІ-генерація.',
    video: 'Відео', videoHint: 'Простий монтаж та генерація відео.',
    assistantTitle: 'Простір для твоїх запитань', assistantHint: 'Майбутній помічник для ідей, текстів і знайомства з LelekaTalk.',
    assistantStatus: 'Локальна ШІ-модель ще не підключена.',
    settings: 'Налаштування', close: 'Закрити', personalName: 'Ім’я особистого профілю', creatorName: 'Ім’я профілю креатора',
    showLink: 'Показувати зв’язок між моїми профілями', profileLinkHint: 'Канали показуватимуть твій особистий username, якщо цей зв’язок увімкнено.',
    language: 'Мова', theme: 'Тема', light: 'Світла', dark: 'Темна', save: 'Зберегти', saved: 'Налаштування збережено', logout: 'Вийти',
    install: 'Встановити', installUnavailable: 'Встановлення залежить від підтримки твого браузера.', menu: 'Відкрити меню',
    unavailable: 'Не вдалося з’єднатися з локальним сервером.',
    errors: { invalid_email: 'Перевір email.', invalid_username: 'Username: 3–24 символи, латинські літери, цифри або _.', invalid_name: 'Ім’я має містити від 1 до 60 символів.', invalid_password: 'Пароль має містити від 12 до 256 символів.', age_confirmation_required: 'Підтвердь, що тобі виповнилося 16 років.', account_conflict: 'Email або username вже використовується.', invalid_credentials: 'Неправильний email або пароль.', too_many_attempts: 'Забагато спроб. Зачекай одну хвилину.', authentication_required: 'Увійди в акаунт ще раз.', invalid_profile: 'Перевір налаштування профілю.', server_error: 'Помилка сервера. Спробуй ще раз.' },
  },
  en: {
    supportTitle: 'Help LelekaTalk grow', supportHint: 'Your support helps develop this Ukrainian messenger.', supportButton: 'Support the project', supportNewTab: 'Opens the monobank jar in a new tab',
    tagline: 'Connect. Create. Be yourself.', intro: 'Your space for conversations, ideas and communities.',
    welcome: 'Welcome back', createAccount: 'Create your own space', login: 'Log in', register: 'Create account',
    email: 'Email', password: 'Password', name: 'Your name', username: 'Username', passwordHint: 'At least 12 characters', age: 'I am at least 16 years old',
    noAccount: 'New here?', hasAccount: 'Already have an account?', working: 'Please wait…',
    localNotice: 'MVP · email verification is not connected yet',
    wall:'My wall', chats: 'Chats', feed: 'Feed', communities: 'Communities', space: 'My space', studio: 'Creative studio', assistant: 'AI assistant',
    subscriptions: 'Following', forYou: 'For you', personal: 'Personal profile', creator: 'Creator profile',
    newChat: 'New chat', search: 'Search conversations', noChats: 'Your conversations will appear here', noChatsHint: 'Start by setting up your profile.',
    hello: 'Hello', homeTitle: 'Conversations start here', homeHint: 'A place for your people, shared ideas and new connections.',
    profileAction: 'Set up profile', discoverAction: 'Explore communities', foundation: 'First build: accounts and profiles work. Messaging, payments and AI are not connected yet.',
    composeLater: 'Messaging will become available once encryption is connected',
    feedTitle: 'Find what inspires you', feedHint: 'Posts, short videos and stories from your future favourite creators.',
    subscriptionsTitle: 'Your creators, in one place', subscriptionsHint: 'Posts from channels you follow will appear here.',
    communityTitle: 'Find your people', communityHint: 'Communities, conversations and a space for shared ideas.',
    creative: 'Creativity', technology: 'Technology', learning: 'Learning', life: 'Lifestyle', coming: 'This feature is still in development.', planned: 'Planned in the PRD',
    spaceTitle: 'More room for your life', spaceHint: 'Plan your day, build habits and collect ideas.',
    calendar: 'Calendar', calendarHint: 'Plans, events and important dates.', habits: 'Habit tracker', habitsHint: 'Small steps towards your goals.',
    studioTitle: 'Ideas becoming content', studioHint: 'From first draft to publication, in your creative space.',
    drafts: 'Posts and drafts', draftsHint: 'Text, media and scheduled publishing.', images: 'Images', imagesHint: 'Editing and local AI generation.',
    video: 'Video', videoHint: 'Simple editing and video generation.', assistantTitle: 'A space for your questions', assistantHint: 'Your future assistant for ideas, writing and discovering LelekaTalk.',
    assistantStatus: 'A local AI model is not connected yet.', settings: 'Settings', close: 'Close', personalName: 'Personal profile name', creatorName: 'Creator profile name',
    showLink: 'Show the connection between my profiles', profileLinkHint: 'Channels show your personal username when this connection is enabled.',
    language: 'Language', theme: 'Theme', light: 'Light', dark: 'Dark', save: 'Save', saved: 'Settings saved', logout: 'Log out',
    install: 'Install', installUnavailable: 'Installation depends on your browser support.', menu: 'Open menu', unavailable: 'Cannot connect to the local server.',
    errors: { invalid_email: 'Check your email.', invalid_username: 'Username: 3–24 lowercase Latin letters, digits or _.', invalid_name: 'Name must be 1–60 characters.', invalid_password: 'Password must be 12–256 characters.', age_confirmation_required: 'Confirm that you are at least 16.', account_conflict: 'Email or username is already in use.', invalid_credentials: 'Incorrect email or password.', too_many_attempts: 'Too many attempts. Wait one minute.', authentication_required: 'Please log in again.', invalid_profile: 'Check your profile settings.', server_error: 'Server error. Please try again.' },
  },
};
const themes = [
  ['light','Світла','Light'],['dark','Темна','Dark'],
  ['ocean','Океан','Ocean'],['forest','Ліс','Forest'],['rose','Троянда','Rose'],['lavender','Лаванда','Lavender'],
  ['sunrise','Світанок','Sunrise'],['aurora','Сяйво','Aurora'],['sky','Небо','Sky'],['midnight','Опівніч','Midnight'],
];
const themeName = theme => theme[state.language==='uk'?1:2];
const validTheme = value => themes.some(theme=>theme[0]===value);
let previewTheme=null;
const icons = {
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  feed: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h4"/>',
  people: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9"/><circle cx="9" cy="7" r="4"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  sparkle: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/>',
  pencil: '<path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  chevron: '<path d="m8 10 4 4 4-4"/>', arrow: '<path d="M12 19V5m-6 6 6-6 6 6"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', close: '<path d="m6 6 12 12M6 18 18 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m21 15-5-5L5 21"/>',
  video: '<rect x="3" y="5" width="13" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
};
function icon(name) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.chat}</svg>`; }
function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function readPreference(key, fallback) { try { return localStorage.getItem(`leleka:${key}`) ?? fallback; } catch { return fallback; } }
function writePreference(key, value) { try { localStorage.setItem(`leleka:${key}`, value); } catch { /* Preferences are optional. */ } }
const state = {
  language: readPreference('language', 'uk') === 'en' ? 'en' : 'uk',
  theme: validTheme(readPreference('theme','light')) ? readPreference('theme','light') : 'light',
  view: ['chats', 'wall', 'feed', 'communities'].includes(readPreference('tab', 'chats')) ? readPreference('tab', 'chats') : 'chats',
  feed: 'forYou', user: null, authMode: 'login', busy: false,
};
const app = document.querySelector('#app');
const dialog = document.querySelector('#settings-dialog');
let installPrompt = null;
let toastTimer;
const text = key => words[state.language][key];
const wall = createWall({api,getState:()=>state,escapeHTML,toast,renderShell});
const mvp = createMvp({ api, getState: () => state, escapeHTML, icon, text, toast, renderShell });
function applyPreferences() {
  document.documentElement.lang = state.language;
  document.body.dataset.theme = previewTheme ?? state.theme;
}
function toast(message) {
  const element = document.querySelector('#toast');
  clearTimeout(toastTimer);
  element.textContent = message;
  element.hidden = false;
  toastTimer = setTimeout(() => { element.hidden = true; }, 4500);
}
async function api(route, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api/${route}`, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error(text('unavailable')); }
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(words[state.language].errors[payload.error] ?? text('unavailable'));
    error.status = response.status;
    error.code = payload.error;
    throw error;
  }
  return payload;
}
function logo(className = '') {
  return `<span class="logo ${className}"><span class="logo-fallback" aria-hidden="true">L</span><img src="/logo.png" alt="LelekaTalk"></span>`;
}
function bindLogoErrors() {
  document.querySelectorAll('.logo img').forEach(image => { image.addEventListener('error', () => { image.hidden = true; }); });
}
function displayName() { return state.user.activeProfile === 'creator' ? state.user.creatorName : state.user.personalName; }
function initials() { return escapeHTML(displayName().slice(0, 1).toUpperCase()); }
function supportCard(placement) {
  return `<section class="support-card support-${placement}" aria-label="${text('supportButton')}"><strong>${text('supportTitle')}</strong><p>${text('supportHint')}</p><a class="button support-button" href="https://send.monobank.ua/jar/5EU4CX6Cmd" target="_blank" rel="noopener noreferrer" aria-label="${text('supportButton')}. ${text('supportNewTab')}"><span aria-hidden="true">♡</span>${text('supportButton')}<span aria-hidden="true">↗</span></a></section>`;
}
function renderAuth() {
  applyPreferences();
  const registration = state.authMode === 'register';
  app.innerHTML = `<main class="auth-layout">
    <section class="auth-story"><a class="brand" href="/">${logo()}<strong>LelekaTalk</strong></a>
      <div class="story-content"><div class="story-image">${logo('large-logo')}</div><h1>${text('tagline')}</h1><p>${text('intro')}</p></div>
      <span class="story-note">LelekaTalk · Україна → світ</span>
    </section>
    <section class="auth-side"><button class="language-toggle" data-action="language">${state.language === 'uk' ? 'English' : 'Українська'}</button>
      <div class="auth-card"><div class="mobile-auth-brand">${logo()}<strong>LelekaTalk</strong></div><h2>${text(registration ? 'createAccount' : 'welcome')}</h2><p class="auth-subtitle">${text('intro')}</p>
        <form id="auth-form">
          ${registration ? `<label>${text('name')}<input name="name" autocomplete="name" maxlength="60" required></label><label>${text('username')}<span class="username-field"><span aria-hidden="true">@</span><input name="username" aria-label="${text('username')}" autocomplete="username" pattern="[a-zA-Z0-9_]{3,24}" minlength="3" maxlength="24" required></span></label>` : ''}
          <label>${text('email')}<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
          <label>${text('password')}<input name="password" aria-label="${text('password')}" type="password" autocomplete="${registration ? 'new-password' : 'current-password'}" ${registration ? 'minlength="12" aria-describedby="password-hint"' : ''} maxlength="256" required>${registration ? `<small id="password-hint">${text('passwordHint')}</small>` : ''}</label>
          ${registration ? `<label class="checkbox"><input name="age" type="checkbox" required><span>${text('age')}</span></label>` : ''}
          <p id="auth-error" class="form-error" role="alert" hidden></p>
          <button class="button primary auth-submit" type="submit">${text(registration ? 'register' : 'login')}</button>
        </form>
        <p class="auth-switch">${text(registration ? 'hasAccount' : 'noAccount')} <button class="text-button" data-action="auth-mode">${text(registration ? 'login' : 'register')}</button></p>
        <p class="local-notice">${text('localNotice')}</p>
        ${supportCard('auth')}
      </div>
    </section></main>`;
  bindLogoErrors();
  document.querySelector('#auth-form').addEventListener('submit', submitAuth);
}
async function submitAuth(event) {
  event.preventDefault();
  if (state.busy) return;
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const errorElement = form.querySelector('#auth-error');
  const fields = new FormData(form);
  const registration = state.authMode === 'register';
  state.busy = true;
  button.disabled = true;
  button.textContent = text('working');
  errorElement.hidden = true;
  try {
    const result = await api(registration ? 'register' : 'login', { method: 'POST', body: { email: fields.get('email'), password: fields.get('password'), name: fields.get('name'), username: fields.get('username'), ageConfirmed: fields.get('age') === 'on' } });
    state.user = result.user;
    await Promise.all([mvp.start(state.user), wall.start()]);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  } finally {
    state.busy = false;
    mvp.syncBusyControls();
    button.disabled = false;
    button.textContent = text(registration ? 'register' : 'login');
  }
}
const navigation = [['chats', 'chat'], ['wall', 'pencil'], ['feed', 'feed'], ['communities', 'people']];
const tools = [['space', 'grid']];
function navItems(items) {
  return items.map(([key, graphic]) => `<button class="nav-item ${state.view === key ? 'active' : ''}" data-view="${key}" ${state.view === key ? 'aria-current="page"' : ''}>${icon(graphic)}<span>${text(key)}</span></button>`).join('');
}
function renderShell() {
  applyPreferences();
  app.innerHTML = `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="/">${logo()}<strong>LelekaTalk</strong></a>
      <button class="new-chat" data-mvp="new-chat">${icon('plus')}<span>${text('newChat')}</span>${icon('pencil')}</button>
      <nav aria-label="LelekaTalk">${navItems(navigation)}</nav>
      ${mvp.sidebar()}<div class="sidebar-divider"></div><nav aria-label="${text('space')}">${navItems(tools)}</nav>
      <div class="sidebar-footer">${supportCard('sidebar')}<div class="sidebar-bottom"><button class="profile-button" data-action="switch-profile"><span class="avatar">${initials()}</span><span><strong>${escapeHTML(displayName())}</strong><small>${text(state.user.activeProfile)}</small></span>${icon('chevron')}</button></div></div>
    </aside>
    <div class="mobile-scrim" data-action="close-menu"></div>
    <main class="workspace"><header class="topbar"><div class="topbar-left"><button class="icon-button mobile-menu" data-action="menu" aria-label="${text('menu')}">${icon('menu')}</button><span>${text(state.view)}</span></div><div class="topbar-actions"><span class="version-pill">MVP 0.2</span>${installPrompt ? `<button class="button small secondary" data-action="install">${text('install')}</button>` : ''}<button class="profile-pill" data-action="switch-profile">${text(state.user.activeProfile)}${icon('chevron')}</button><button class="icon-button" data-action="settings" aria-label="${text('settings')}">${icon('settings')}</button></div></header>
      ${mvp.notice()}${mvp.notificationNotice()}<div class="view-content ${mvp.open() ? 'conversation-content' : ''}">${renderView()}</div>
      <nav class="mobile-bottom" aria-label="LelekaTalk">${navItems(navigation)}</nav>
    </main></div>`;
  bindLogoErrors();
  mvp.bind();
  wall.bind();
}
function featureCard(graphic, title, description) {
  return `<button class="feature-card" data-action="coming"><span class="feature-icon">${icon(graphic)}</span><h3>${text(title)}</h3><p>${text(description)}</p><span class="planned-tag">${text('planned')}</span></button>`;
}
function renderView() {
  if(state.view==='wall')return wall.render();
  const implemented = mvp.view(state.view);
  if (implemented !== null) return implemented;
  if (state.view === 'chats') return `<section class="chat-welcome"><div class="greeting">${text('hello')}, ${escapeHTML(displayName())}</div>${logo('welcome-logo')}<h1>${text('homeTitle')}</h1><p>${text('homeHint')}</p><div class="welcome-actions"><button class="button primary" data-action="settings">${text('profileAction')}</button><button class="button secondary" data-view="communities">${text('discoverAction')}</button></div></section><div class="composer"><button class="icon-button" disabled aria-label="${text('coming')}">${icon('plus')}</button><span>${text('composeLater')}</span><button class="send-button" disabled aria-label="${text('coming')}">${icon('arrow')}</button></div>`;
  if (state.view === 'feed') return `<section class="section-page"><div class="segmented"><button data-feed="subscriptions" class="${state.feed === 'subscriptions' ? 'selected' : ''}" aria-pressed="${state.feed === 'subscriptions'}">${text('subscriptions')}</button><button data-feed="forYou" class="${state.feed === 'forYou' ? 'selected' : ''}" aria-pressed="${state.feed === 'forYou'}">${text('forYou')}</button></div><div class="section-empty"><span class="empty-icon">${icon('feed')}</span><h1>${text(state.feed === 'forYou' ? 'feedTitle' : 'subscriptionsTitle')}</h1><p>${text(state.feed === 'forYou' ? 'feedHint' : 'subscriptionsHint')}</p><span class="planned-tag">${text('planned')}</span></div></section>`;
  if (state.view === 'communities') return `<section class="section-page"><div class="section-heading"><span class="eyebrow">LelekaTalk</span><h1>${text('communityTitle')}</h1><p>${text('communityHint')}</p></div><div class="category-grid">${[['pencil', 'creative'], ['sparkle', 'technology'], ['feed', 'learning'], ['people', 'life']].map(([graphic, label]) => `<button class="category-card" data-action="coming">${icon(graphic)}<strong>${text(label)}</strong><span>${text('planned')}</span></button>`).join('')}</div></section>`;
  if (state.view === 'space') return `<section class="section-page"><div class="section-heading"><span class="eyebrow">${text('space')}</span><h1>${text('spaceTitle')}</h1><p>${text('spaceHint')}</p></div><div class="feature-grid">${featureCard('calendar', 'calendar', 'calendarHint')}${featureCard('check', 'habits', 'habitsHint')}</div></section>`;
  if (state.view === 'studio') return `<section class="section-page"><div class="section-heading"><span class="eyebrow">${text('studio')}</span><h1>${text('studioTitle')}</h1><p>${text('studioHint')}</p></div><div class="feature-grid">${featureCard('pencil', 'drafts', 'draftsHint')}${featureCard('image', 'images', 'imagesHint')}${featureCard('video', 'video', 'videoHint')}</div></section>`;
  return `<section class="section-empty assistant-empty"><span class="empty-icon">${icon('sparkle')}</span><h1>${text('assistantTitle')}</h1><p>${text('assistantHint')}</p><span class="status-note">${text('assistantStatus')}</span></section>`;
}
function render() { state.user ? renderShell() : renderAuth(); }
dialog.addEventListener('close',()=>{previewTheme=null;applyPreferences();});
function openSettings() {
  previewTheme=state.theme;
  dialog.innerHTML = `<div class="dialog-heading"><h2 id="settings-title">${text('settings')}</h2><button class="icon-button" data-action="close-settings" aria-label="${text('close')}">${icon('close')}</button></div><form id="settings-form"><div class="profile-detail"><span class="avatar">${initials()}</span><span><strong>${escapeHTML(displayName())}</strong><small>@${escapeHTML(state.user.username)}</small></span></div><label>${text('personalName')}<input name="personalName" value="${escapeHTML(state.user.personalName)}" required maxlength="60"></label><label>${text('creatorName')}<input name="creatorName" value="${escapeHTML(state.user.creatorName)}" required maxlength="60"></label><label class="checkbox"><input type="checkbox" name="showProfileLink" ${state.user.showProfileLink ? 'checked' : ''}><span>${text('showLink')}</span></label><p class="field-note">${text('profileLinkHint')}</p><div class="settings-row"><label>${text('language')}<select name="language"><option value="uk" ${state.language === 'uk' ? 'selected' : ''}>Українська</option><option value="en" ${state.language === 'en' ? 'selected' : ''}>English</option></select></label><label>${text('theme')}<select name="theme">${themes.map(theme=>`<option value="${theme[0]}" ${state.theme===theme[0]?'selected':''}>${themeName(theme)}</option>`).join('')}</select></label></div><fieldset class="theme-picker"><legend>${text('theme')}</legend><p class="theme-hint">${state.language==='uk'?'Обери колір або градієнт. Перегляд одразу, збереження — кнопкою нижче.':'Pick a color or gradient. Preview instantly, then save below.'}</p><div class="theme-grid">${themes.map(theme=>`<button type="button" class="theme-swatch" data-theme-choice="${theme[0]}" aria-pressed="${state.theme===theme[0]}"><span class="theme-swatch-color" aria-hidden="true"><span></span><span></span></span><span>${themeName(theme)}</span></button>`).join('')}</div></fieldset><p id="settings-error" class="form-error" role="alert" hidden></p><button class="button primary" type="submit">${text('save')}</button><button class="button logout-button" type="button" data-action="logout">${text('logout')}</button></form>`;
  for (const field of ['language', 'theme']) {
    dialog.querySelector(`[name="${field}"]`).setAttribute('aria-label', text(field));
  }
  function preview(value){
    if(!validTheme(value))return;
    previewTheme=value;dialog.querySelector('[name="theme"]').value=value;
    for(const swatch of dialog.querySelectorAll('[data-theme-choice]'))swatch.setAttribute('aria-pressed',String(swatch.dataset.themeChoice===value));
    applyPreferences();
  }
  dialog.querySelector('[name="theme"]').addEventListener('change',event=>preview(event.target.value));
  dialog.querySelectorAll('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>preview(button.dataset.themeChoice)));
  dialog.showModal();
  dialog.querySelector('#settings-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const button = form.querySelector('[type="submit"]');
    const errorElement = form.querySelector('#settings-error');
    state.busy = true;
    button.disabled = true;
    errorElement.hidden = true;
    try {
      const result = await api('profile', { method: 'PATCH', body: { personalName: fields.get('personalName'), creatorName: fields.get('creatorName'), showProfileLink: fields.get('showProfileLink') === 'on' } });
      state.user = result.user;
      state.language = fields.get('language');
      state.theme = validTheme(fields.get('theme')) ? fields.get('theme') : 'light';
      writePreference('language', state.language);
      writePreference('theme', state.theme);
      dialog.close();
      renderShell();
      toast(text('saved'));
    } catch (error) { errorElement.textContent = error.message; errorElement.hidden = false; }
    finally { state.busy = false; mvp.syncBusyControls(); button.disabled = false; }
  });
}
document.addEventListener('click', async event => {
  const button = event.target.closest('button, .mobile-scrim');
  if (!button || button.disabled) return;
  if (state.busy) return;
  if (button.dataset.view && state.user) {
    state.view = button.dataset.view;
    if (['chats', 'wall', 'feed', 'communities'].includes(state.view)) writePreference('tab', state.view);
    if(state.view==='wall'){renderShell();await wall.refresh();}
    else if (['feed', 'communities', 'space'].includes(state.view)) await mvp.refresh();
    else renderShell();
    return;
  }
  if (button.dataset.feed) { state.feed = button.dataset.feed; renderShell(); return; }
  const action = button.dataset.action;
  if (action === 'coming') { toast(text('coming')); return; }
  if (action === 'auth-mode') { state.authMode = state.authMode === 'login' ? 'register' : 'login'; renderAuth(); return; }
  if (action === 'language') { state.language = state.language === 'uk' ? 'en' : 'uk'; writePreference('language', state.language); render(); return; }
  if (action === 'settings') { openSettings(); return; }
  if (action === 'close-settings') { dialog.close(); return; }
  if (action === 'menu') { document.querySelector('.app-shell').classList.toggle('menu-open'); return; }
  if (action === 'close-menu') { document.querySelector('.app-shell').classList.remove('menu-open'); return; }
  if (action === 'install') {
    if (!installPrompt) return toast(text('installUnavailable'));
    await installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    renderShell();
    return;
  }
  if (action === 'switch-profile') {
    state.busy = true;
    try {
      const result = await api('profile', { method: 'PATCH', body: { activeProfile: state.user.activeProfile === 'personal' ? 'creator' : 'personal' } });
      state.user = result.user;
      renderShell();
    } catch (error) { toast(error.message); }
    finally { state.busy = false; mvp.syncBusyControls(); }
  }
  if (action === 'logout') {
    state.busy = true;
    try { await api('logout', { method: 'POST' }); wall.stop(); await mvp.stop(state.user.id); state.user = null; dialog.close(); renderAuth(); }
    catch (error) { toast(error.message); }
    finally { state.busy = false; mvp.syncBusyControls(); }
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') document.querySelector('.app-shell')?.classList.remove('menu-open');
});
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPrompt = event;
  if (state.user) renderShell();
});
async function start() {
  applyPreferences();
  try { state.user = (await api('me')).user; }
  catch (error) { if (error.status !== 401) toast(error.message); }
  if (state.user) { await Promise.all([mvp.start(state.user), wall.start()]); }
  else renderAuth();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* Online operation does not depend on installation support. */ });
}
start();
