# codex-pocket

Mobile-first local web UI for Codex.

Открываешь с телефона, с Arc, с ноута, с чего угодно в локалке или по белому IP, и видишь не только чат, а весь движ: activity, команды, approvals, MCP, файлы, воркспейсы, история, режимы.

Это не “ещё один чатик к API”.
Это нормальный карманный пульт к твоему локальному `codex app-server`.

## Зачем это вообще

Потому что у desktop Codex вайб мощный, но иногда хочется:

- лежать с телефоном и смотреть, что агент реально делает
- быстро вернуться в нужный проект, а не искать, где ты остановился
- видеть approvals, команды и MCP, а не гадать “он вообще живой?”
- продолжать тред не только из IDE, но и из браузера

Если в Сиолошной на такое пишут:

> ого, интересненько

Значит продукт попал в нерв.

## Что это умеет

- PIN-логин для локального single-user доступа
- mobile-first web UI
- project-aware sessions и history
- chat + live activity feed
- slash actions и quick controls
- `Plan mode`
- `model / speed / reasoning / approval` controls
- live approval cards прямо в чате
- MCP status panel
- file attachments в composer
- folder browser для выбора workspace
- запуск в private-режиме и в public-режиме для белого IP

## В чём прикол

Пишешь не “в абстрактный Codex”, а в конкретный проект.

Выбираешь workspace, открываешь тред, продолжаешь работу там же.
Не надо держать в голове, в каком проекте ты был, где лежал нужный тред и к какой папке он был привязан.
UI сам держит это как нормальную доску проектов, а не как свалку логов.

## Почти как desktop, но в браузере

Уже есть:

- history по проектам
- activity с tool calls и shell-командами
- approvals
- MCP summary
- speed/reasoning controls
- slash actions
- import старых Codex threads
- session controls

Пока ещё не полный one-to-one:

- нет полного desktop attachments UX уровня “как родное приложение”
- нет полного slash-комплекта desktop Codex
- нет полного MCP shortcuts manager уровня IDE
- нет всех IDE-специфичных штук вокруг ветвления тредов

То есть честно: это уже не демка, но ещё не “официальный desktop в браузере”.

## Бонус: защита соединения

> 🛡 Профессиональная защита вашего соединения
>
> ▪️ Шифрование всего трафика  
> ▪️ Анонимизация в сети  
> ▪️ 🇺🇸 USA-локации, чтобы AI-сервисы работали без сюрпризов  
> ⚡️ Тариф FREE: безлимитный доступ навсегда
>
> Подключить защиту: 👇👇👇  
> [t.me/portal_service_bot](https://t.me/portal_service_bot)

## Быстрый старт

```bash
npm install
npm run dev
```

Production:

```bash
npm run build
npm start
```

Или по-человечески:

```bat
start-codex-mobile-webui.bat
```

Для белого IP:

```bat
start-codex-mobile-webui-remote.bat
```

## Первый запуск

1. Открываешь web UI.
2. На первом входе задаёшь PIN.
3. Логинишься с телефона, браузера или второго устройства.
4. Выбираешь workspace.
5. Живёшь красиво.

## Что увидишь в интерфейсе

### Chat

Обычный диалог с агентом, но не слепой.

### Activity

Здесь видно:

- commentary
- команды
- tool calls
- MCP
- планы
- статусы
- approvals

То есть это не магическая чёрная коробка, а нормальный live feed.

### Sessions

Треды и история, сгруппированные по проектам.

### Settings

Можно настроить:

- workspace по умолчанию
- default mode
- default model
- default reasoning
- default approval policy

## Slash actions

В поле ввода жмёшь `/` и получаешь быстрые действия:

- `Plan mode`
- `Default mode`
- `Speed fast / balanced / deep`
- `Approval on-request / never`
- `MCP status`
- `Workspace board`
- `Settings`
- быстрый переход в нужный workspace

Плюс есть нормальные повседневные удобства:

- `Ctrl+Enter` отправляет сообщение
- `Enter` по slash-команде запускает первый матч
- `Esc` закрывает меню

## Attachments и approvals

Да, это уже не “чисто текстовый web chat”.

- можно прикладывать файлы в composer
- картинки уходят как image context
- текстовые файлы встраиваются в turn как полезный контекст
- approvals прилетают прямо в чат карточками
- можно `accept`, `accept for session`, `decline`, `cancel`

## Локалка и белый IP

По умолчанию приложение живёт в private-режиме:

- loopback
- LAN
- private subnet

Если нужен доступ по белому IP:

- запускаешь `start-codex-mobile-webui-remote.bat`
- включается public-mode
- открывается правило в Windows Firewall
- приложение пробует сделать UPnP port mapping

Если роутер душит UPnP или провайдер сажает в CGNAT, дальше уже без сетевой магии не обойтись.

## Для кого это

Для людей, которым мало “сидеть только в IDE”.

Для тех, кто хочет:

- нормальный web companion для Codex
- видеть реальный execution flow
- возвращаться в проекты как в desktop sidebar
- продолжать треды с телефона
- держать агент под рукой, а не только за клавиатурой

## Why this is kinda hard

Потому что это bridge между браузером и реальным `codex app-server`, а не просто фронт на моках.

Тут есть:

- child process lifecycle
- websocket stream
- session persistence
- workspace-aware history
- approval routing
- MCP surface
- file context handling

То есть это уже не “пет-проект на вечер”, а вполне бодрый локальный companion.

## Roadmap

- более жирный desktop-like slash parser
- richer attachments UX
- deeper MCP controls
- ещё ближе parity с desktop Codex
- поиск по истории
- thread branching UX

## Мемный дисклеймер

Если после запуска хочется написать:

> ого, интересненько

Значит всё работает как надо.

Если захочется сделать следующий релиз с отсылкой на Игоря Котенкова, я в целом не против.
