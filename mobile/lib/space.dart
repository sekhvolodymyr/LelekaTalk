import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'session.dart';
import 'widgets.dart';
import 'calendar.dart';

class Space extends StatefulWidget {
  final Session session;
  const Space(this.session, {super.key});
  @override
  State<Space> createState() => _SpaceState();
}

class _SpaceState extends State<Space> {
  DateTime day = DateTime.now();
  List<Json> plans = [], habits = [];
  bool loading = true, busy = false;
  String? error;
  Timer? timer;
  final cache = <String, Json>{};
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
        !widget.session.vault.unlocked ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.paused) {
      if (mounted && loading) setState(() => loading = false);
      return;
    }
    busy = true;
    try {
      final result = await Future.wait([
        widget.session.api.get('mvp/plans'),
        widget.session.api.get('mvp/habits'),
      ]);
      final collections = <List<Json>>[];
      for (var i = 0; i < 2; i++) {
        final kind = i == 0 ? 'plan' : 'habit';
        final records = <Json>[];
        for (final item
            in (result[i][i == 0 ? 'plans' : 'habits'] as List).cast<Json>()) {
          try {
            Json payload;
            if (cache[item['id']]?['ciphertext'] == item['ciphertext']) {
              payload = cache[item['id']]!;
            } else {
              payload = await widget.session.vault.decrypt(
                item['ciphertext'],
                widget.session.vault.identity!,
                {'kind': kind, 'id': item['id']},
              );
              cache[item['id']] = {
                ...payload,
                'ciphertext': item['ciphertext'],
              };
            }
            records.add({...item, 'title': payload['title']});
          } catch (_) {
            records.add({
              ...item,
              'title': 'Не вдалося перевірити приватний запис',
              'failed': true,
            });
          }
        }
        collections.add(records);
      }
      if (mounted)
        setState(() {
          plans = collections[0];
          habits = collections[1];
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

  Future<void> add(bool habit, {Json? plan}) async {
    final values = await fieldsDialog(
      context,
      habit
          ? 'Нова звичка'
          : plan == null
          ? 'Нова подія'
          : 'Редагувати подію',
      {'title': habit ? 'Назва звички' : 'Назва події'},
      initial: plan ?? {},
      maxLength: 200,
    );
    if (values == null || !mounted) return;
    final id = plan?['id'] ?? const Uuid().v4();
    final ciphertext = await widget.session.vault.encrypt({
      'kind': habit ? 'habit' : 'plan',
      'id': id,
      'title': values['title'],
    });
    if (habit) {
      await widget.session.api.post('mvp/habits', {
        'id': id,
        'ciphertext': ciphertext,
      });
    } else {
      if (!mounted) return;
      final selected = await showDatePicker(
        context: context,
        initialDate: plan == null ? day : DateTime.parse(plan['date']),
        firstDate: DateTime(1900),
        lastDate: DateTime(2200),
      );
      if (selected == null || !mounted) return;
      final time = await showTimePicker(
        context: context,
        initialTime: TimeOfDay.now(),
      );
      final data = <String, dynamic>{
        'ciphertext': ciphertext,
        'date': dayString(selected),
        'time': time == null
            ? ''
            : '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}',
      };
      if (plan == null) {
        await widget.session.api.post('mvp/plans', {'id': id, ...data});
      } else {
        await widget.session.api.patch('mvp/plans/$id', data);
      }
      if (mounted) setState(() => day = selected);
    }
    await load();
  }

  Future<void> perform(Future<dynamic> Function() action) async {
    try {
      await action();
      await load();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final date = dayString(day),
        todays = plans.where((p) => p['date'] == date).toList()
          ..sort((a, b) => (a['time'] as String).compareTo(b['time']));
    return !widget.session.vault.unlocked
        ? const EmptyState(
            'Мій простір захищений',
            'Розблокуйте приватні дані кодом відновлення.',
          )
        : loading
        ? const Center(child: CircularProgressIndicator())
        : RefreshIndicator(
            onRefresh: load,
            child: ListView(
              padding: const EdgeInsets.all(20),
              children: [
                Text(
                  'Більше місця для твого життя',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text('Плануй день, розвивай звички та збирай ідеї.'),
                const SizedBox(height: 20),
                if (error != null)
                  ListTile(
                    title: Text(error!),
                    trailing: IconButton(
                      onPressed: load,
                      icon: const Icon(Icons.refresh),
                    ),
                  ),
                Row(
                  children: [
                    IconButton(
                      tooltip: 'Попередній день',
                      onPressed: () => setState(
                        () => day = day.subtract(const Duration(days: 1)),
                      ),
                      icon: const Icon(Icons.chevron_left),
                    ),
                    Expanded(
                      child: TextButton(
                        onPressed: () async {
                          final selected = await showDatePicker(
                            context: context,
                            initialDate: day,
                            firstDate: DateTime(1900),
                            lastDate: DateTime(2200),
                          );
                          if (selected != null) setState(() => day = selected);
                        },
                        child: Text(date),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Наступний день',
                      onPressed: () => setState(
                        () => day = day.add(const Duration(days: 1)),
                      ),
                      icon: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Календар',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    AsyncAction(
                      onPressed: () => add(false),
                      child: const Icon(Icons.add),
                    ),
                  ],
                ),
                if (todays.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'На цей день ще немає подій.',
                      style: TextStyle(color: Colors.grey),
                    ),
                  ),
                for (final plan in todays)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Checkbox(
                      value: plan['done'],
                      onChanged: (v) => perform(
                        () => widget.session.api.patch(
                          'mvp/plans/${plan['id']}',
                          {'done': v},
                        ),
                      ),
                    ),
                    title: Text(
                      plan['title'],
                      style: TextStyle(
                        decoration: plan['done'] == true
                            ? TextDecoration.lineThrough
                            : null,
                      ),
                    ),
                    subtitle: Text(
                      plan['time'].isEmpty ? 'Увесь день' : plan['time'],
                    ),
                    trailing: PopupMenuButton<String>(
                      onSelected: (action) => perform(() async {
                        if (action == 'edit') {
                          await add(false, plan: plan);
                        } else if (action == 'delete') {
                          if (await confirm(context, 'Видалити подію?'))
                            await widget.session.api.delete(
                              'mvp/plans/${plan['id']}',
                            );
                        } else {
                          await launchUrl(
                            googleEventLink(plan),
                            mode: LaunchMode.externalApplication,
                          );
                        }
                      }),
                      itemBuilder: (_) => const [
                        PopupMenuItem(
                          value: 'edit',
                          child: Text('Редагувати й перенести'),
                        ),
                        PopupMenuItem(
                          value: 'google',
                          child: Text('Додати в Google Calendar'),
                        ),
                        PopupMenuItem(value: 'delete', child: Text('Видалити')),
                      ],
                    ),
                  ),
                OutlinedButton.icon(
                  icon: const Icon(Icons.ios_share),
                  label: const Text('Експортувати день .ics'),
                  onPressed: () => perform(() async {
                    final file = File(
                      '${(await getTemporaryDirectory()).path}/lelekatalk-$date.ics',
                    );
                    await file.writeAsString(buildIcs(todays, date));
                    await SharePlus.instance.share(
                      ShareParams(
                        files: [XFile(file.path, mimeType: 'text/calendar')],
                        text: 'LelekaTalk · $date',
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 32),
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Трекер звичок',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    AsyncAction(
                      onPressed: () => add(true),
                      child: const Icon(Icons.add),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                for (final habit in habits)
                  Container(
                    margin: const EdgeInsets.only(bottom: 14),
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.secondaryContainer,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                habit['title'],
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                            IconButton(
                              tooltip: 'Видалити звичку',
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => perform(() async {
                                if (await confirm(context, 'Видалити звичку?'))
                                  await widget.session.api.delete(
                                    'mvp/habits/${habit['id']}',
                                  );
                              }),
                            ),
                          ],
                        ),
                        Wrap(
                          spacing: 4,
                          children: List.generate(7, (index) {
                            final date = dayString(
                                  day.subtract(Duration(days: 6 - index)),
                                ),
                                complete = (habit['completedDates'] as List)
                                    .contains(date);
                            return FilterChip(
                              label: Text(date.substring(8)),
                              selected: complete,
                              onSelected: (v) => perform(
                                () => widget.session.api.patch(
                                  'mvp/habits/${habit['id']}',
                                  {'date': date, 'completed': v},
                                ),
                              ),
                            );
                          }),
                        ),
                      ],
                    ),
                  ),
                if (habits.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Text(
                      'Маленькі кроки до твоїх цілей. Додай першу звичку.',
                    ),
                  ),
              ],
            ),
          );
  }
}
