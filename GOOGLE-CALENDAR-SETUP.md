# Підключення Google Calendar до LelekaTalk

Локальний календар, редагування, перенесення, виконання, видалення та завантаження `.ics` працюють одразу. «Додати до Google» без підключення відкриває заповнену форму Google, де користувач сам зберігає подію. Подія з часом за замовчуванням триває одну годину; без часу — увесь день.

Для перегляду й керування Google-подіями безпосередньо у «Моєму просторі» потрібен **OAuth Client ID** власного Google Cloud-проєкту LelekaTalk. Client Secret та API key для цього способу не потрібні.

1. У [Google Cloud Console](https://console.cloud.google.com/) оберіть або створіть проєкт LelekaTalk і ввімкніть **Google Calendar API**.
2. У **Google Auth Platform** заповніть Branding/Audience, контактні дані й OAuth consent screen. Для початкової перевірки використовуйте режим **Testing** та додайте власну Google-адресу до Test users.
3. У Data Access додайте scopes:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
4. Створіть OAuth Client типу **Web application**. У **Authorized JavaScript origins** додайте `https://lelekatalk.vercel.app`. Для локальної розробки також додайте `http://localhost` і `http://localhost:3000`; відкривайте локальний застосунок саме з цього origin. Тут використовується popup token flow, тому власний callback/redirect endpoint не потрібен.
5. Скопіюйте публічний Client ID, який закінчується на `.apps.googleusercontent.com`. У Vercel → LelekaTalk → Settings → Environment Variables додайте `GOOGLE_CALENDAR_CLIENT_ID` для Production і виконайте redeploy. Для localhost задайте цю саму змінну середовища перед запуском сервера.
6. Оновіть LelekaTalk → «Мій простір» → «Підключити Google Календар». Оберіть акаунт і надайте обидва дозволи. Перевірте список календарів, тестову подію та від’єднання.

Для доступу всіх користувачів замість Test users Google може вимагати перевірку застосунку та scopes, підтверджений домен і публічну політику конфіденційності. Перед переходом у Production виконайте вимоги, показані Google Auth Platform для вашого проєкту.

## Як працює інтеграція

Авторизація використовує Google Identity Services. Access token живе лише в пам’яті поточної вкладки до завершення строку доступу; він не зберігається в localStorage, Supabase чи на сервері LelekaTalk. Після оновлення сторінки або завершення доступу потрібно знову натиснути підключення. «Від’єднати» очищає дані вкладки й відкликає Google-дозвіл; вихід із LelekaTalk очищає локальний сеанс, не видаляючи Google-подій.

У Google-панелі можна вибирати календар, переглядати вибраний день, створювати, редагувати й видаляти події. Календарі без права запису відкриваються лише для перегляду. Зміни наявних подій перевіряють `etag`, щоб не перезаписувати паралельні зміни. Редагується окремий екземпляр повторюваної події; керування правилами повторення не додано. Запрошення учасникам не розсилаються (`sendUpdates=none`).

Це керування Google-подіями у відкритій вкладці, **не фонова двостороння синхронізація**. Локальні плани залишаються зашифрованими; текст передається Google лише після явного натискання «Додати до Google». Google-події не імпортуються автоматично в локальне сховище. Вивантаження `.ics` містить лише доступні локальні події вибраного дня, розшифровані поточним користувачем.

## Перевірки

`npm test`: 40 тестів, зокрема приватність/власник редагованих планів, атомарна валідація, публічна OAuth-конфігурація, DST, Google-посилання й UTF-8 `.ics`.

Chrome/Playwright: справжні локальні реєстрація, шифрування, створення/редагування/перенесення, `.ics`; OAuth і Calendar API імітує тестовий провайдер. Перевірено CRUD Google, календар без права запису, HTTP 401/412, відмову у scopes, revoke, відсутність автоматичного передавання локальних планів і збереження токенів, мобільний/комп’ютерний вигляд. **Живий Google OAuth не перевірено: Client ID ще не надано.**

Документація Google: [token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [налаштування Client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [захист паралельних змін](https://developers.google.com/workspace/calendar/api/guides/version-resources).
