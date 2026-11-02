import 'dart:async';

import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'session.dart';
import 'widgets.dart';
import 'rtc.dart';

String chatTitle(Json chat, Session session) => chat['type'] == 'group'
    ? chat['title']
    : ((chat['members'] as List)
              .cast<Json>()
              .where((m) => m['id'] != session.user!['id'])
              .firstOrNull?['name'] ??
          'Чат');

class Chats extends StatefulWidget {
  final Session session;
  final Calls calls;
  const Chats(this.session, {super.key, required this.calls});
  @override
  State<Chats> createState() => _ChatsState();
}

class _ChatsState extends State<Chats> {
  List<Json> chats = [];
  Timer? timer;
  String query = '';
  String? error;
  bool loading = true, polling = false;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 3), (_) => load());
  }

  Future<void> load() async {
    if (polling ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.paused)
      return;
    polling = true;
    try {
      final result = await widget.session.api.get('mvp/chats');
      if (mounted)
        setState(() {
          chats = (result['chats'] as List).cast<Json>();
          error = null;
          loading = false;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          error = e.toString();
          loading = false;
        });
    } finally {
      polling = false;
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  void open(Json chat) => Navigator.push(
    context,
    MaterialPageRoute(
      builder: (_) => Conversation(widget.session, chat, calls: widget.calls),
    ),
  ).then((_) => load());
  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                decoration: const InputDecoration(
                  hintText: 'Пошук розмов',
                  prefixIcon: Icon(Icons.search),
                ),
                onChanged: (v) => setState(() => query = v),
              ),
            ),
            IconButton(
              tooltip: 'Новий чат',
              onPressed: () async {
                final chat = await Navigator.push<Json>(
                  context,
                  MaterialPageRoute(builder: (_) => NewChat(widget.session)),
                );
                if (chat != null && mounted) open(chat);
              },
              icon: const Icon(Icons.edit_square),
            ),
          ],
        ),
      ),
      if (error != null)
        ListTile(
          title: Text(error!),
          trailing: IconButton(
            onPressed: load,
            icon: const Icon(Icons.refresh),
          ),
        ),
      Expanded(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : chats.isEmpty
            ? EmptyState(
                'Розмови починаються тут',
                'Місце для близьких людей, спільних ідей і нових знайомств.',
                action: FilledButton(
                  onPressed: () async {
                    final chat = await Navigator.push<Json>(
                      context,
                      MaterialPageRoute(
                        builder: (_) => NewChat(widget.session),
                      ),
                    );
                    if (chat != null && mounted) open(chat);
                  },
                  child: const Text('Новий чат'),
                ),
              )
            : RefreshIndicator(
                onRefresh: load,
                child: ListView(
                  children: [
                    for (final chat in chats.where(
                      (c) => chatTitle(
                        c,
                        widget.session,
                      ).toLowerCase().contains(query.toLowerCase()),
                    ))
                      ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 7,
                        ),
                        leading: CircleAvatar(
                          backgroundColor: Theme.of(
                            context,
                          ).colorScheme.secondaryContainer,
                          child: Icon(
                            chat['type'] == 'group'
                                ? Icons.group_outlined
                                : Icons.person_outline,
                          ),
                        ),
                        title: Text(chatTitle(chat, widget.session)),
                        subtitle: Text(
                          chat['myStatus'] == 'invited'
                              ? 'Запрошення до розмови'
                              : '${chat['messageCount']} повідомлень · зашифровано',
                          style: const TextStyle(fontSize: 12),
                        ),
                        trailing: chat['myStatus'] == 'invited'
                            ? const Icon(
                                Icons.circle,
                                color: Color(0xffb48000),
                                size: 9,
                              )
                            : null,
                        onTap: () => open(chat),
                      ),
                  ],
                ),
              ),
      ),
    ],
  );
}

class NewChat extends StatefulWidget {
  final Session session;
  final String? inviteChat;
  const NewChat(this.session, {super.key, this.inviteChat});
  @override
  State<NewChat> createState() => _NewChatState();
}

class _NewChatState extends State<NewChat> {
  final query = TextEditingController(), title = TextEditingController();
  List<Json> users = [];
  final selected = <String>{};
  bool group = false;
  @override
  void dispose() {
    query.dispose();
    title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(
        widget.inviteChat == null ? 'Новий чат' : 'Запросити учасника',
      ),
    ),
    body: Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          if (widget.inviteChat == null)
            SwitchListTile(
              title: const Text('Груповий чат'),
              value: group,
              onChanged: (v) => setState(() => group = v),
            ),
          if (group)
            TextField(
              controller: title,
              maxLength: 80,
              decoration: const InputDecoration(labelText: 'Назва групи'),
            ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: query,
                  decoration: const InputDecoration(
                    labelText: 'Ім’я або @username',
                  ),
                ),
              ),
              AsyncAction(
                onPressed: () async {
                  final result = await widget.session.api.get(
                    'mvp/users?q=${Uri.encodeQueryComponent(query.text)}',
                  );
                  if (mounted)
                    setState(
                      () => users = (result['users'] as List).cast<Json>(),
                    );
                },
                child: const Icon(Icons.search),
              ),
            ],
          ),
          Expanded(
            child: ListView(
              children: users
                  .map(
                    (person) => ListTile(
                      title: Text(person['name']),
                      subtitle: Text('@${person['username']}'),
                      trailing: group
                          ? Checkbox(
                              value: selected.contains(person['id']),
                              onChanged: (_) => setState(
                                () => selected.contains(person['id'])
                                    ? selected.remove(person['id'])
                                    : selected.add(person['id']),
                              ),
                            )
                          : null,
                      onTap: group
                          ? () => setState(
                              () => selected.contains(person['id'])
                                  ? selected.remove(person['id'])
                                  : selected.add(person['id']),
                            )
                          : () async {
                              try {
                                final result = await widget.session.api.post(
                                  widget.inviteChat == null
                                      ? 'mvp/chats'
                                      : 'mvp/chats/${widget.inviteChat}/invite',
                                  {'type': 'direct', 'userId': person['id']},
                                );
                                if (context.mounted)
                                  Navigator.pop(context, result['chat']);
                              } catch (e) {
                                if (context.mounted) showError(context, e);
                              }
                            },
                    ),
                  )
                  .toList(),
            ),
          ),
          if (group)
            AsyncAction(
              onPressed: () async {
                final result = await widget.session.api.post('mvp/chats', {
                  'type': 'group',
                  'title': title.text.trim(),
                  'userIds': selected.toList(),
                });
                if (context.mounted) Navigator.pop(context, result['chat']);
              },
              child: const Text('Створити групу'),
            ),
        ],
      ),
    ),
  );
}

class Conversation extends StatefulWidget {
  final Session session;
  final Json initial;
  final Calls calls;
  const Conversation(
    this.session,
    this.initial, {
    super.key,
    required this.calls,
  });
  @override
  State<Conversation> createState() => _ConversationState();
}

class _ConversationState extends State<Conversation> {
  late Json chat = widget.initial;
  final draft = TextEditingController(), scroll = ScrollController();
  final Map<String, Json> records = {};
  Timer? timer;
  bool polling = false, sending = false, older = false;
  String? error;
  Session get s => widget.session;
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 3), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    draft.dispose();
    scroll.dispose();
    super.dispose();
  }

  Future<void> load({bool previous = false}) async {
    if (polling || chat['myStatus'] != 'accepted' || !s.vault.unlocked) return;
    polling = true;
    try {
      var after = records.isEmpty
          ? null
          : records.values
                .map((m) => m['seq'] as int)
                .reduce((a, b) => a > b ? a : b);
      final before = records.isEmpty
          ? null
          : records.values
                .map((m) => m['seq'] as int)
                .reduce((a, b) => a < b ? a : b);
      var more = true;
      while (more && mounted) {
        final query = previous
            ? '?before=$before'
            : after == null
            ? ''
            : '?after=$after';
        final result = await s.api.get(
          'mvp/chats/${chat['id']}/messages$query',
        );
        if (!mounted) return;
        chat = result['chat'];
        final messages = (result['messages'] as List).cast<Json>();
        for (final message in messages) {
          final sender = (chat['members'] as List).cast<Json>().firstWhere(
            (m) => m['id'] == message['senderId'],
          );
          try {
            final payload = await s.vault
                .decrypt(message['ciphertext'], sender, {
                  'kind': 'message',
                  'id': message['id'],
                  'chatId': chat['id'],
                  'senderId': sender['id'],
                }, result['serverTime']);
            records[message['id']] = {
              ...message,
              'text': payload['text'],
              'author': sender['name'],
            };
          } catch (_) {
            records[message['id']] = {
              ...message,
              'text':
                  'Не вдалося перевірити підпис або розшифрувати повідомлення.',
              'failed': true,
            };
          }
        }
        if (previous || after == null) {
          older = result['hasMore'] == true;
          more = false;
        } else {
          more = result['hasMore'] == true && messages.isNotEmpty;
        }
        if (messages.isNotEmpty) after = messages.last['seq'];
      }
      if (mounted) setState(() => error = null);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      polling = false;
    }
  }

  Future<void> send() async {
    if (sending || draft.text.trim().isEmpty) return;
    final submitted = draft.text,
        text = submitted.trim(),
        id = const Uuid().v4();
    if (text.length > 4000) {
      showError(context, 'До 4000 символів.');
      return;
    }
    setState(() => sending = true);
    try {
      final ciphertext = await s.vault.encrypt(
        {
          'kind': 'message',
          'id': id,
          'chatId': chat['id'],
          'senderId': s.user!['id'],
          'text': text,
        },
        (chat['members'] as List)
            .cast<Json>()
            .where((p) => p['status'] == 'accepted')
            .toList(),
      );
      await s.api.post('mvp/chats/${chat['id']}/messages', {
        'id': id,
        'ciphertext': ciphertext,
        'revision': chat['revision'],
      });
      if (!mounted) return;
      if (draft.text == submitted) draft.clear();
      await load();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  Future<void> action(String name) async {
    try {
      if (name == 'keys') {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Відбитки ключів'),
            content: SizedBox(
              width: 420,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Звір відбиток зі співрозмовником через інший надійний канал.',
                    ),
                    for (final person
                        in (chat['members'] as List).cast<Json>()) ...[
                      const SizedBox(height: 16),
                      Text(person['name'] ?? person['username'] ?? ''),
                      SelectableText(
                        (person['fingerprint'] as String? ?? 'Ключ недоступний')
                            .toUpperCase(),
                        style: const TextStyle(
                          fontFamily: 'monospace',
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Закрити'),
              ),
            ],
          ),
        );
        return;
      }
      if (name == 'invite') {
        await Navigator.push(
          context,
          MaterialPageRoute(builder: (_) => NewChat(s, inviteChat: chat['id'])),
        );
        await load();
        return;
      }
      if (name == 'report') {
        final fields = await fieldsDialog(context, 'Скарга', {
          'description': 'Опишіть проблему',
        }, maxLength: 2000);
        if (fields == null) return;
        await s.api.post('mvp/reports', {'chatId': chat['id'], ...fields});
        return;
      }
      if (!await confirm(
        context,
        '${{'block': 'Заблокувати контакт', 'unblock': 'Розблокувати контакт', 'leave': 'Вийти з групи', 'reject': 'Відхилити запрошення'}[name] ?? 'Прийняти запрошення'}?',
      ))
        return;
      final result = await s.api.post('mvp/chats/${chat['id']}/$name');
      if (!mounted) return;
      if (name == 'leave' || name == 'reject') {
        Navigator.pop(context);
        return;
      }
      setState(() => chat = result['chat']);
      await load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final messages = records.values.toList()
      ..sort((a, b) => (a['seq'] as int).compareTo(b['seq'] as int));
    final ready =
        chat['myStatus'] == 'accepted' &&
        chat['ready'] == true &&
        chat['blocked'] != true &&
        s.vault.unlocked;
    return Scaffold(
      appBar: AppBar(
        title: Text(chatTitle(chat, s), style: const TextStyle(fontSize: 17)),
        actions: [
          if (chat['type'] == 'direct' && ready) ...[
            IconButton(
              tooltip: 'Аудіодзвінок',
              icon: const Icon(Icons.call_outlined),
              onPressed: () async {
                try {
                  await widget.calls.dial(chat, false);
                } catch (e) {
                  if (context.mounted) showError(context, e);
                }
              },
            ),
            IconButton(
              tooltip: 'Відеодзвінок',
              icon: const Icon(Icons.videocam_outlined),
              onPressed: () async {
                try {
                  await widget.calls.dial(chat, true);
                } catch (e) {
                  if (context.mounted) showError(context, e);
                }
              },
            ),
          ],
          PopupMenuButton<String>(
            onSelected: action,
            itemBuilder: (_) => [
              const PopupMenuItem(
                value: 'keys',
                child: Text('Відбитки ключів'),
              ),
              if (chat['type'] == 'direct')
                PopupMenuItem(
                  value: chat['blockedByMe'] == true ? 'unblock' : 'block',
                  child: Text(
                    chat['blockedByMe'] == true
                        ? 'Розблокувати'
                        : 'Заблокувати',
                  ),
                ),
              if (chat['type'] == 'group' && chat['ownerId'] == s.user!['id'])
                const PopupMenuItem(
                  value: 'invite',
                  child: Text('Запросити учасника'),
                ),
              if (chat['type'] == 'group' && chat['ownerId'] != s.user!['id'])
                const PopupMenuItem(
                  value: 'leave',
                  child: Text('Вийти з групи'),
                ),
              const PopupMenuItem(value: 'report', child: Text('Поскаржитися')),
            ],
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (chat['myStatus'] == 'invited')
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Text('Запрошення до розмови'),
                    Wrap(
                      spacing: 12,
                      children: [
                        FilledButton(
                          onPressed: () => action('accept'),
                          child: const Text('Прийняти'),
                        ),
                        TextButton(
                          onPressed: () => action('reject'),
                          child: const Text('Відхилити'),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            if (!s.vault.unlocked)
              const Padding(
                padding: EdgeInsets.all(20),
                child: Text('Розблокуйте приватні дані на головному екрані.'),
              ),
            if (error != null)
              ListTile(
                title: Text(error!),
                trailing: IconButton(
                  onPressed: load,
                  icon: const Icon(Icons.refresh),
                ),
              ),
            if (older)
              TextButton(
                onPressed: () => load(previous: true),
                child: const Text('Попередні повідомлення'),
              ),
            Expanded(
              child: messages.isEmpty
                  ? const Center(
                      child: Text('Повідомлення зашифровані. Почніть розмову.'),
                    )
                  : ListView.builder(
                      controller: scroll,
                      reverse: true,
                      padding: const EdgeInsets.all(16),
                      itemCount: messages.length,
                      itemBuilder: (context, index) {
                        final m = messages[messages.length - 1 - index],
                            mine = m['senderId'] == s.user!['id'];
                        return Align(
                          alignment: mine
                              ? Alignment.centerRight
                              : Alignment.centerLeft,
                          child: Container(
                            constraints: BoxConstraints(
                              maxWidth: MediaQuery.sizeOf(context).width * .82,
                            ),
                            margin: const EdgeInsets.only(bottom: 14),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                            decoration: BoxDecoration(
                              color: mine
                                  ? Theme.of(
                                      context,
                                    ).colorScheme.secondaryContainer
                                  : Theme.of(context).colorScheme.surface,
                              border: mine
                                  ? null
                                  : Border.all(
                                      color: Theme.of(
                                        context,
                                      ).dividerColor.withValues(alpha: .15),
                                    ),
                              borderRadius: BorderRadius.only(
                                topLeft: const Radius.circular(18),
                                topRight: const Radius.circular(18),
                                bottomLeft: Radius.circular(mine ? 18 : 4),
                                bottomRight: Radius.circular(mine ? 4 : 18),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                if (chat['type'] == 'group' && !mine)
                                  Text(
                                    m['author'] ?? '',
                                    style: const TextStyle(fontSize: 11),
                                  ),
                                SelectableText(
                                  m['text'] ?? '',
                                  style: TextStyle(
                                    fontSize: 15,
                                    height: 1.6,
                                    color: m['failed'] == true
                                        ? Colors.red
                                        : null,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Text(
                                  (DateTime.tryParse(
                                            m['createdAt'],
                                          )?.toLocal().toString() ??
                                          '')
                                      .substring(0, 16),
                                  style: const TextStyle(
                                    fontSize: 10,
                                    color: Colors.grey,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(
                    child: TextField(
                      controller: draft,
                      enabled: ready,
                      minLines: 1,
                      maxLines: 5,
                      maxLength: 4000,
                      decoration: InputDecoration(
                        hintText: chat['blocked'] == true
                            ? 'Контакт заблоковано'
                            : chat['ready'] != true
                            ? 'Очікуємо прийняття запрошення'
                            : 'Повідомлення…',
                        counterText: '',
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    tooltip: 'Надіслати',
                    onPressed: ready && !sending ? send : null,
                    icon: Icon(
                      sending ? Icons.hourglass_empty : Icons.arrow_upward,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
