import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'session.dart';
import 'theme.dart';
import 'widgets.dart';
import 'chats.dart';
import 'social.dart';
import 'space.dart';
import 'rtc.dart';
import 'studio.dart';

class Shell extends StatefulWidget {
  final Session session;
  const Shell(this.session, {super.key});
  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  int page = 0;
  late final calls = Calls(widget.session);
  final studioKey = GlobalKey<StudioScreenState>();
  Future<void> select(int next) async {
    if (next == page) return;
    if (page == 5 && !(await studioKey.currentState?.beforeLeave() ?? true))
      return;
    if (mounted) setState(() => page = next);
  }

  bool callVisible = false, active = true;
  static const labels = [
    'Чати',
    'Моя стіна',
    'Стрічка',
    'Спільноти',
    'Мій простір',
    'Моя студія',
    'ШІ-помічник',
  ];
  static const icons = [
    Icons.chat_bubble_outline,
    Icons.notes_outlined,
    Icons.dynamic_feed_outlined,
    Icons.people_outline,
    Icons.calendar_month_outlined,
    Icons.video_camera_front_outlined,
    Icons.auto_awesome_outlined,
  ];
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    calls.addListener(callChanged);
    calls.start();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    active = state == AppLifecycleState.resumed;
    calls.foreground = active;
    if (active) calls.poll();
  }

  void callChanged() {
    if (!mounted || calls.call == null || callVisible) return;
    callVisible = true;
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => CallScreen(calls)))
        .whenComplete(() => callVisible = false);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    calls.removeListener(callChanged);
    calls.shutdown();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.session;
    final content = switch (page) {
      0 => Chats(s, calls: calls),
      1 => Wall(s),
      2 => Channels(s, feed: true),
      3 => Channels(s),
      4 => Space(s),
      5 => StudioScreen(s, key: studioKey),
      _ => const EmptyState(
        'Простір для твоїх запитань',
        'Локальна ШІ-модель ще не підключена у вебверсії LelekaTalk.',
      ),
    };
    return Scaffold(
      appBar: AppBar(
        title: Text(labels[page], style: const TextStyle(fontSize: 18)),
        actions: [
          PopupMenuButton<String>(
            tooltip: 'Активний профіль',
            icon: const Icon(Icons.account_circle_outlined),
            onSelected: (value) async {
              try {
                await s.profile({'activeProfile': value});
              } catch (e) {
                if (context.mounted) showError(context, e);
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'personal',
                child: Text('Особистий профіль'),
              ),
              const PopupMenuItem(
                value: 'creator',
                child: Text('Профіль креатора'),
              ),
            ],
          ),
          IconButton(
            tooltip: 'Налаштування',
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => Settings(s, calls)),
            ),
          ),
        ],
      ),
      drawer: Drawer(
        child: SafeArea(
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.all(24),
                child: Row(
                  children: [
                    Logo(),
                    SizedBox(width: 12),
                    Text('LelekaTalk', style: TextStyle(fontSize: 22)),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  children: [
                    for (var i = 0; i < labels.length; i++)
                      ListTile(
                        selected: i == page,
                        leading: Icon(icons[i]),
                        title: Text(labels[i]),
                        onTap: () {
                          Navigator.pop(context);
                          select(i);
                        },
                      ),
                  ],
                ),
              ),
              const Divider(),
              ListTile(
                leading: CircleAvatar(
                  child: Text(
                    (s.user!['personalName'] as String).characters.first,
                  ),
                ),
                title: Text(s.user!['personalName']),
                subtitle: Text('@${s.user!['username']}'),
              ),
            ],
          ),
        ),
      ),
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: s.palette.gradient == null
              ? null
              : LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: s.palette.gradient!,
                ),
        ),
        child: Column(
          children: [
            if (s.recovery != null || !s.vault.unlocked) recoveryPanel(),
            Expanded(
              child: KeyedSubtree(key: ValueKey(page), child: content),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: page,
        onDestinationSelected: select,
        destinations: [
          for (var i = 0; i < labels.length; i++)
            NavigationDestination(
              icon: Icon(icons[i]),
              label: i == 1
                  ? 'Стіна'
                  : i == 4
                  ? 'Простір'
                  : i == 5
                  ? 'Студія'
                  : i == 6
                  ? 'ШІ'
                  : labels[i],
            ),
        ],
      ),
    );
  }

  Widget recoveryPanel() {
    final s = widget.session;
    return Container(
      margin: const EdgeInsets.all(14),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.secondaryContainer,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            s.recovery != null
                ? 'Збережи код відновлення'
                : 'Розблокуй приватні дані',
            style: const TextStyle(fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 8),
          if (s.recovery != null) ...[
            const Text(
              'Це єдиний спосіб відкрити історію на іншому пристрої. Збережи код у надійному місці.',
            ),
            const SizedBox(height: 8),
            SelectableText(
              s.recovery!,
              style: const TextStyle(fontFamily: 'monospace'),
            ),
            TextButton(
              onPressed: s.acknowledgeRecovery,
              child: const Text('Я зберіг код'),
            ),
          ] else if (s.vault.identity == null) ...[
            const Text(
              'Приватні ключі не завантажилися. Перевір з’єднання та повтори.',
            ),
            AsyncAction(
              onPressed: s.reloadVault,
              child: const Text('Повторити завантаження ключів'),
            ),
          ] else ...[
            const Text(
              'Введи код відновлення з вебверсії. Пароль акаунта не замінює його.',
            ),
            TextButton(
              onPressed: () async {
                final values = await fieldsDialog(context, 'Код відновлення', {
                  'code': 'Код',
                });
                if (values == null) return;
                try {
                  await s.unlock(values['code']);
                } catch (_) {
                  if (mounted)
                    showError(
                      context,
                      'Не вдалося розблокувати ключ. Перевірте код відновлення.',
                    );
                }
              },
              child: const Text('Розблокувати'),
            ),
          ],
        ],
      ),
    );
  }
}

class Settings extends StatefulWidget {
  final Session session;
  final Calls calls;
  const Settings(this.session, this.calls, {super.key});
  @override
  State<Settings> createState() => _SettingsState();
}

class _SettingsState extends State<Settings> {
  late final personal = TextEditingController(
    text: widget.session.user!['personalName'],
  );
  late final creator = TextEditingController(
    text: widget.session.user!['creatorName'],
  );
  late bool linked = widget.session.user!['showProfileLink'];
  late final original = widget.session.palette;
  late LelekaPalette selected = original;
  bool saved = false;
  @override
  void dispose() {
    personal.dispose();
    creator.dispose();
    if (!saved) widget.session.theme(original);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Налаштування')),
    body: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        TextField(
          controller: personal,
          maxLength: 60,
          decoration: const InputDecoration(
            labelText: 'Ім’я особистого профілю',
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: creator,
          maxLength: 60,
          decoration: const InputDecoration(labelText: 'Ім’я профілю креатора'),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Показувати зв’язок між профілями'),
          value: linked,
          onChanged: (v) => setState(() => linked = v),
        ),
        const Divider(),
        const Text('Тема', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: LelekaPalette.all
              .map(
                (p) => ChoiceChip(
                  label: Text(p.name),
                  avatar: CircleAvatar(backgroundColor: p.accent, radius: 9),
                  selected: selected == p,
                  onSelected: (_) {
                    setState(() => selected = p);
                    widget.session.theme(p);
                  },
                ),
              )
              .toList(),
        ),
        const SizedBox(height: 24),
        AsyncAction(
          onPressed: () async {
            await widget.session.profile({
              'personalName': personal.text.trim(),
              'creatorName': creator.text.trim(),
              'showProfileLink': linked,
            });
            await widget.session.theme(selected);
            saved = true;
            if (context.mounted) Navigator.pop(context);
          },
          child: const Text('Зберегти'),
        ),
        const SizedBox(height: 24),
        const Text(
          'Синхронізація',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        Text(
          'Спільний акаунт і дані з ${widget.session.api.origin.host}. Оновлення під час роботи застосунку — кожні 3 секунди. Тема зберігається на цьому пристрої, як у вебверсії.',
        ),
        const SizedBox(height: 16),
        const Text(
          'Сповіщення у фоні потребують окремої Android push-інтеграції. Для вхідних дзвінків тримайте застосунок відкритим.',
        ),
        const SizedBox(height: 24),
        OutlinedButton(
          onPressed: () => launchUrl(
            Uri.parse('https://lelekatalk.vercel.app'),
            mode: LaunchMode.externalApplication,
          ),
          child: const Text('Відкрити вебверсію'),
        ),
        const SizedBox(height: 16),
        AsyncAction(
          onPressed: () async {
            await widget.calls.hangup();
            await widget.session.logout();
            if (context.mounted) Navigator.pop(context);
          },
          child: const Text('Вийти з акаунта'),
        ),
      ],
    ),
  );
}
