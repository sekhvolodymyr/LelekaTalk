# Робочий дизайн-референс

Створений вбудованим Image Gen. Файл: `chat-reference-v1.png`, 1586×992. Окреме погодження макета користувачем не відбувалося; погоджений напрям — максимально близький до ChatGPT інтерфейс із брендом LelekaTalk.

Оригінальний логотип має пріоритет над згенерованим знаком. Візуальна перевірка основного екрана виконана через view_image на розмірі референсу. Перевірено також 1440×900 і мобільний варіант 390×844.

## Prompt

Use case: ui-mockup. Asset type: single full desktop application screen design reference for a Ukrainian messenger LelekaTalk. Render a flat straight-on browser-free screenshot at 1440x900, no device frame, no perspective, no annotations. Match the recognizable ChatGPT desktop skeleton extremely closely: 266px light gray (#f9f9f9) full-height left sidebar, true white (#ffffff) spacious main canvas, neutral system sans-serif font, thin light gray borders, rounded simple controls, restrained low density. Brand LelekaTalk, small yellow square app icon with cartoon stork on yellow, black outline orange beak (existing logo placeholder reference; actual supplied asset will be used in code). Sidebar brand top 19px offset, button 'Новий чат', navigation rows 'Чати' (selected lightgray), 'Стрічка', 'Спільноти'. Divider then 'Мій простір', 'Креативна студія', 'ШІ-помічник'. Bottom profile avatar initial О and 'Олена' with 'Особистий профіль'. Top main bar label 'Чати', tiny version 0.1 and right 'Особистий профіль' dropdown and settings control. Slim development information bar just under header: 'Перша збірка: акаунти та профілі працюють. Чати, платежі й ШІ ще не підключені.' It is important not to imply messages or payment capabilities already work. Main empty welcome state center: small muted greeting 'Привіт, Олена', 55px yellow app logo, heading 'Розмови починаються тут', muted description 'Місце для близьких людей, спільних ідей і нових знайомств.', black rounded primary action 'Налаштувати профіль' and white outlined secondary action 'Переглянути спільноти'. At bottom centered 760px wide light gray disabled rounded composer: plus on left, text 'Надсилання повідомлень буде доступне після підключення шифрування', disabled arrow button right. The UI is code-native HTML CSS controls and typography, no hero photograph, no marketing wrappers, no added tabs, no made-up metrics, no fake conversations, no decorative cards or additional claims. Complete full application surface with all sidebar and bottom components in frame, highly legible Ukrainian text, professional calm UI.

## Результат звірки

| Елемент | Референс / реалізація | Дія |
|---|---|---|
| Компонування | Бічна панель, центрований порожній стан, нижнє поле | Вирівняно структуру та пропорції |
| Тексти | Назви вкладок, заголовок, дії та пояснення стану | Збережено основні тексти; додано локалізацію |
| Типографіка | Системний шрифт, виразний заголовок | Збільшено первісні розміри дрібних елементів; точна тотожність шрифту зображення не заявляється |
| Палітра | Білий центр, сіра панель, чорні кнопки, блакитне пояснення | Узгоджено кольори, додано темну тему |
| Бренд | Генератор намалював іншу лелеку | Використано справжній логотип користувача |
| Кнопки й поле | Вертикальні основні дії та недоступне поле повідомлення | Вирівняно ширини, відступи й радіуси; відправлення вимкнене |
| Мобільний варіант | У референсі не показаний | Адаптовано той самий стиль із нижньою навігацією та меню; перевірено відсутність горизонтального переповнення |

Це робоча звірка першої збірки, а не заява про затверджений дизайн чи готовність повного продукту.
