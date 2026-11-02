import 'dart:async';

import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'session.dart';
import 'widgets.dart';

class Wall extends StatefulWidget {
  final Session session;
  const Wall(this.session, {super.key});
  @override
  State<Wall> createState() => _WallState();
}

class _WallState extends State<Wall> {
  List<Json> entries = [];
  int? cursor;
  bool mine = false, loading = true, busy = false;
  String? error;
  Timer? timer;
  final draft = TextEditingController();
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
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    if (busy ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.paused)
      return;
    busy = true;
    final mode = mine;
    try {
      final result = await widget.session.api.get(
        'mvp/wall?mode=${mine ? 'mine' : 'all'}${more && cursor != null ? '&before=$cursor' : ''}',
      );
      if (!mounted || mode != mine) return;
      final received = (result['entries'] as List).cast<Json>();
      int? next = result['nextCursor'];
      if (!more) {
        final wanted = entries.length;
        while (next != null && received.length < wanted) {
          final page = await widget.session.api.get(
            'mvp/wall?mode=${mode ? 'mine' : 'all'}&before=$next',
          );
          if (!mounted || mode != mine) return;
          received.addAll((page['entries'] as List).cast<Json>());
          final int? following = page['nextCursor'];
          if (following == next) break;
          next = following;
        }
      }
      setState(() {
        if (more) {
          entries = [...entries, ...received];
          cursor = next;
        } else {
          entries = received;
          cursor = next;
        }
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
      busy = false;
    }
  }

  Future<void> mutate(Future<dynamic> Function() work) async {
    try {
      await work();
      await load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        child: SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: false, label: Text('Усі дописи')),
            ButtonSegment(value: true, label: Text('Мої дописи')),
          ],
          selected: {mine},
          onSelectionChanged: (v) {
            setState(() {
              mine = v.first;
              entries = [];
              cursor = null;
            });
            load();
          },
        ),
      ),
      Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            TextField(
              controller: draft,
              maxLength: 500,
              minLines: 2,
              maxLines: 5,
              decoration: const InputDecoration(
                hintText: 'Чим хочеш поділитися?',
              ),
            ),
            AsyncAction(
              onPressed: () async {
                final text = draft.text;
                await widget.session.api.post('mvp/wall', {
                  'id': const Uuid().v4(),
                  'text': text.trim(),
                });
                if (draft.text == text) draft.clear();
                await load();
              },
              child: const Text('Опублікувати'),
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
            : entries.isEmpty
            ? const EmptyState(
                'Твоя стіна починається з тебе',
                'Поділися думкою. Дописи публічні для користувачів LelekaTalk.',
              )
            : RefreshIndicator(
                onRefresh: load,
                child: ListView.builder(
                  itemCount: entries.length + (cursor == null ? 0 : 1),
                  itemBuilder: (context, index) {
                    if (index == entries.length)
                      return TextButton(
                        onPressed: () => load(more: true),
                        child: const Text('Більше дописів'),
                      );
                    final entry = entries[index];
                    final Json post = entry['post'];
                    return PostCard(
                      post,
                      wall: true,
                      repostBy: entry['repostBy']?['name'],
                      onLike: () => mutate(
                        () => widget.session.api.post(
                          'mvp/wall/${post['id']}/like',
                          {'liked': post['liked'] != true},
                        ),
                      ),
                      onComment: () => Navigator.push(
                        context,
                        MaterialPageRoute(
                          builder: (_) =>
                              Comments(widget.session, post, wall: true),
                        ),
                      ).then((_) => load()),
                      onRepost: () => mutate(
                        () => widget.session.api.post(
                          'mvp/wall/${post['id']}/repost',
                          {'reposted': post['reposted'] != true},
                        ),
                      ),
                      onDelete: post['isMine'] == true
                          ? () async {
                              if (await confirm(context, 'Видалити допис?'))
                                await mutate(
                                  () => widget.session.api.delete(
                                    'mvp/wall/${post['id']}',
                                  ),
                                );
                            }
                          : null,
                    );
                  },
                ),
              ),
      ),
    ],
  );
}

class PostCard extends StatelessWidget {
  final Json post;
  final bool wall;
  final String? repostBy;
  final VoidCallback onLike, onComment;
  final VoidCallback? onRepost, onDelete, onChannel;
  const PostCard(
    this.post, {
    super.key,
    this.wall = false,
    this.repostBy,
    required this.onLike,
    required this.onComment,
    this.onRepost,
    this.onDelete,
    this.onChannel,
  });
  @override
  Widget build(BuildContext context) {
    final String author = wall
        ? post['author']['name']
        : post['channel']['creatorName'];
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: Theme.of(context).dividerColor.withValues(alpha: .15),
          ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (repostBy != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                '↻ $repostBy',
                style: const TextStyle(color: Colors.grey, fontSize: 12),
              ),
            ),
          Row(
            children: [
              CircleAvatar(
                backgroundColor: Theme.of(
                  context,
                ).colorScheme.secondaryContainer,
                child: Text(author.characters.firstOrNull ?? 'L'),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    InkWell(
                      onTap: onChannel,
                      child: Text(
                        wall ? author : post['channel']['title'],
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                    Text(
                      wall ? '@${post['author']['username']}' : author,
                      style: const TextStyle(color: Colors.grey, fontSize: 12),
                    ),
                  ],
                ),
              ),
              if (onDelete != null)
                IconButton(
                  tooltip: 'Видалити допис',
                  onPressed: onDelete,
                  icon: const Icon(Icons.delete_outline, size: 20),
                ),
            ],
          ),
          const SizedBox(height: 16),
          SelectableText(
            post['text'],
            style: const TextStyle(height: 1.7, fontSize: 15),
          ),
          const SizedBox(height: 12),
          Text(
            (post['createdAt'] ?? '')
                .toString()
                .replaceFirst('T', ' ')
                .split('.')
                .first,
            style: const TextStyle(fontSize: 10, color: Colors.grey),
          ),
          const SizedBox(height: 6),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 8,
            children: [
              TextButton.icon(
                onPressed: onLike,
                icon: Icon(
                  post['liked'] == true
                      ? Icons.favorite
                      : Icons.favorite_border,
                  size: 20,
                ),
                label: Text('${post['likes']}'),
              ),
              TextButton.icon(
                onPressed: onComment,
                icon: const Icon(Icons.chat_bubble_outline, size: 20),
                label: Text(
                  '${post['commentCount'] ?? (post['comments'] as List?)?.length ?? 0}',
                ),
              ),
              if (wall)
                TextButton.icon(
                  onPressed: onRepost,
                  icon: Icon(
                    Icons.repeat,
                    color: post['reposted'] == true ? Colors.green : null,
                    size: 20,
                  ),
                  label: Text('${post['reposts']}'),
                ),
              if (wall)
                IconButton(
                  tooltip: 'Поширити',
                  onPressed: () => SharePlus.instance.share(
                    ShareParams(
                      text: 'https://lelekatalk.vercel.app/?wall=${post['id']}',
                    ),
                  ),
                  icon: const Icon(Icons.ios_share, size: 20),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class Comments extends StatefulWidget {
  final Session session;
  final Json post;
  final bool wall;
  const Comments(this.session, this.post, {super.key, this.wall = false});
  @override
  State<Comments> createState() => _CommentsState();
}

class _CommentsState extends State<Comments> {
  List<Json> comments = [];
  String? cursor, error;
  final draft = TextEditingController();
  bool loading = true;
  String get path =>
      'mvp/${widget.wall ? 'wall' : 'posts'}/${widget.post['id']}';
  @override
  void initState() {
    super.initState();
    load();
  }

  @override
  void dispose() {
    draft.dispose();
    super.dispose();
  }

  Future<void> load({bool more = false}) async {
    try {
      final result = await widget.session.api.get(
        widget.wall
            ? path
            : '$path/comments${more && cursor != null ? '?before=$cursor' : ''}',
      );
      if (mounted)
        setState(() {
          final page = (result['comments'] as List).cast<Json>();
          comments = more ? [...page, ...comments] : page;
          cursor = result['nextCursor'];
          loading = false;
          error = null;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          error = e.toString();
          loading = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Обговорення')),
    body: SafeArea(
      child: Column(
        children: [
          if (error != null)
            ListTile(
              title: Text(error!),
              trailing: IconButton(
                onPressed: load,
                icon: const Icon(Icons.refresh),
              ),
            ),
          if (cursor != null)
            TextButton(
              onPressed: () => load(more: true),
              child: const Text('Попередні коментарі'),
            ),
          Expanded(
            child: loading
                ? const Center(child: CircularProgressIndicator())
                : RefreshIndicator(
                    onRefresh: load,
                    child: ListView(
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(20),
                          child: Text(
                            widget.post['text'],
                            style: const TextStyle(fontSize: 17, height: 1.6),
                          ),
                        ),
                        const Divider(),
                        for (final c in comments)
                          ListTile(
                            title: Text(
                              widget.wall
                                  ? c['author']['name']
                                  : c['authorName'],
                            ),
                            subtitle: Text(c['text']),
                            trailing:
                                widget.wall &&
                                    (c['isMine'] == true ||
                                        widget.post['isMine'] == true)
                                ? IconButton(
                                    tooltip: 'Видалити коментар',
                                    icon: const Icon(Icons.delete_outline),
                                    onPressed: () async {
                                      if (!await confirm(
                                        context,
                                        'Видалити коментар?',
                                      ))
                                        return;
                                      try {
                                        await widget.session.api.delete(
                                          '$path/comments/${c['id']}',
                                        );
                                        await load();
                                      } catch (e) {
                                        if (context.mounted)
                                          showError(context, e);
                                      }
                                    },
                                  )
                                : null,
                          ),
                      ],
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: draft,
                    minLines: 1,
                    maxLines: 4,
                    maxLength: widget.wall ? 1000 : 2000,
                    decoration: const InputDecoration(
                      hintText: 'Коментар…',
                      counterText: '',
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                AsyncAction(
                  onPressed: () async {
                    final submitted = draft.text;
                    await widget.session.api.post('$path/comments', {
                      'text': submitted.trim(),
                      if (widget.wall) 'id': const Uuid().v4(),
                    });
                    if (draft.text == submitted) draft.clear();
                    await load();
                  },
                  child: const Icon(Icons.arrow_upward),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class Channels extends StatefulWidget {
  final Session session;
  final bool feed;
  final String? channelId;
  const Channels(this.session, {super.key, this.feed = false, this.channelId});
  @override
  State<Channels> createState() => _ChannelsState();
}

class _ChannelsState extends State<Channels> {
  List<Json> channels = [], posts = [];
  Json? channel;
  String query = '', topic = '', mode = 'all';
  String? error;
  bool loading = true, busy = false;
  Timer? timer;
  static const topics = {
    '': 'Усі',
    'creative': 'Творчість',
    'technology': 'Технології',
    'learning': 'Навчання',
    'life': 'Стиль життя',
  };
  @override
  void initState() {
    super.initState();
    load();
    timer = Timer.periodic(const Duration(seconds: 3), (_) => load());
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  Future<void> load() async {
    if (busy ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.paused)
      return;
    busy = true;
    try {
      final result = await widget.session.api.get(
        widget.channelId != null
            ? 'mvp/channels/${widget.channelId}'
            : widget.feed
            ? 'mvp/feed?mode=$mode'
            : 'mvp/channels?q=${Uri.encodeQueryComponent(query)}${topic.isEmpty ? '' : '&topic=$topic'}',
      );
      if (mounted)
        setState(() {
          channels = (result['channels'] as List? ?? []).cast<Json>();
          posts = (result['posts'] as List? ?? []).cast<Json>();
          channel = result['channel'];
          loading = false;
          error = null;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          error = e.toString();
          loading = false;
        });
    } finally {
      busy = false;
    }
  }

  Future<void> compose() async {
    if (channel != null) {
      final fields = await fieldsDialog(context, 'Новий допис', {
        'text': 'Текст',
      }, maxLength: 5000);
      if (fields == null) return;
      await widget.session.api.post(
        'mvp/channels/${channel!['id']}/posts',
        fields,
      );
    } else {
      final fields = await fieldsDialog(
        context,
        'Створити канал',
        {'title': 'Назва', 'description': 'Опис'},
        maxLength: 500,
        limits: const {'title': 80},
        optional: const {'description'},
      );
      if (fields == null || !mounted) return;
      final selected = await showDialog<String>(
        context: context,
        builder: (context) => SimpleDialog(
          title: const Text('Тема каналу'),
          children: [
            for (final e in topics.entries.where((e) => e.key.isNotEmpty))
              SimpleDialogOption(
                onPressed: () => Navigator.pop(context, e.key),
                child: Text(e.value),
              ),
          ],
        ),
      );
      if (selected == null) return;
      await widget.session.api.post('mvp/channels', {
        ...fields,
        'topic': selected,
      });
    }
    await load();
  }

  @override
  Widget build(BuildContext context) {
    final content = Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (widget.feed)
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'all', label: Text('Для вас')),
                    ButtonSegment(value: 'following', label: Text('Підписки')),
                  ],
                  selected: {mode},
                  onSelectionChanged: (v) {
                    setState(() => mode = v.first);
                    load();
                  },
                )
              else if (channel != null) ...[
                Text(
                  channel!['title'],
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                Text(channel!['description']),
                Text(
                  '${channel!['creatorName']} · ${channel!['followers']} підписників',
                  style: const TextStyle(color: Colors.grey),
                ),
                const SizedBox(height: 12),
                AsyncAction(
                  onPressed: () async {
                    await widget.session.api.post(
                      'mvp/channels/${channel!['id']}/follow',
                      {'following': channel!['following'] != true},
                    );
                    await load();
                  },
                  child: Text(
                    channel!['following'] == true
                        ? 'Відписатися'
                        : 'Підписатися',
                  ),
                ),
              ] else ...[
                TextField(
                  decoration: const InputDecoration(
                    hintText: 'Пошук спільнот',
                    prefixIcon: Icon(Icons.search),
                  ),
                  onChanged: (v) {
                    query = v;
                  },
                  onSubmitted: (_) => load(),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (final e in topics.entries)
                        Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: ChoiceChip(
                            label: Text(e.value),
                            selected: topic == e.key,
                            onSelected: (_) {
                              setState(() => topic = e.key);
                              load();
                            },
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (!widget.feed &&
                  (channel == null || channel!['isOwner'] == true))
                AsyncAction(
                  onPressed: compose,
                  child: Text(
                    channel == null ? 'Створити канал' : 'Опублікувати допис',
                  ),
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
              : RefreshIndicator(
                  onRefresh: load,
                  child: ListView(
                    children: [
                      if (channels.isEmpty && posts.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(30),
                          child: Text(
                            'Тут поки немає публікацій або спільнот.',
                            textAlign: TextAlign.center,
                          ),
                        ),
                      for (final c in channels)
                        ListTile(
                          leading: const CircleAvatar(
                            child: Icon(Icons.people_outline),
                          ),
                          title: Text(c['title']),
                          subtitle: Text(
                            '${c['description']}\n${c['followers']} підписників',
                          ),
                          isThreeLine: true,
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) =>
                                  Channels(widget.session, channelId: c['id']),
                            ),
                          ),
                        ),
                      for (final post in posts)
                        PostCard(
                          post,
                          onChannel: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => Channels(
                                widget.session,
                                channelId: post['channel']['id'],
                              ),
                            ),
                          ),
                          onLike: () async {
                            try {
                              await widget.session.api.post(
                                'mvp/posts/${post['id']}/like',
                                {'liked': post['liked'] != true},
                              );
                              await load();
                            } catch (e) {
                              if (context.mounted) showError(context, e);
                            }
                          },
                          onComment: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => Comments(widget.session, post),
                            ),
                          ).then((_) => load()),
                          onDelete: post['channel']['isOwner'] == true
                              ? () async {
                                  if (!await confirm(
                                    context,
                                    'Видалити допис?',
                                  ))
                                    return;
                                  try {
                                    await widget.session.api.delete(
                                      'mvp/posts/${post['id']}',
                                    );
                                    await load();
                                  } catch (e) {
                                    if (context.mounted) showError(context, e);
                                  }
                                }
                              : null,
                        ),
                    ],
                  ),
                ),
        ),
      ],
    );
    return widget.channelId == null
        ? content
        : Scaffold(
            appBar: AppBar(title: const Text('Спільнота')),
            body: content,
          );
  }
}
