import 'package:flutter/material.dart';

import 'api.dart';

void showError(BuildContext context, Object error) {
  if (!context.mounted) return;
  final text = error.toString().contains('keys_locked')
      ? 'Спочатку розблокуйте приватні дані.'
      : error.toString().contains('key_changed')
      ? 'Ключ змінився. Звірте відбиток ключа зі співрозмовником.'
      : error.toString();
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
}

class Logo extends StatelessWidget {
  final double size;
  const Logo({super.key, this.size = 40});
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(size * .26),
    child: Image.asset('assets/logo.png', width: size, height: size),
  );
}

class EmptyState extends StatelessWidget {
  final String title, hint;
  final Widget? action;
  const EmptyState(this.title, this.hint, {super.key, this.action});
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Logo(size: 58),
          const SizedBox(height: 24),
          Text(
            title,
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 14),
          Text(
            hint,
            textAlign: TextAlign.center,
            style: const TextStyle(height: 1.6, color: Colors.grey),
          ),
          if (action != null) ...[const SizedBox(height: 24), action!],
        ],
      ),
    ),
  );
}

Future<Json?> fieldsDialog(
  BuildContext context,
  String title,
  Map<String, String> fields, {
  Json initial = const {},
  int maxLength = 5000,
  Map<String, int> limits = const {},
  Set<String> optional = const {},
}) async {
  final controllers = {
    for (final key in fields.keys)
      key: TextEditingController(text: initial[key]?.toString() ?? ''),
  };
  final form = GlobalKey<FormState>();
  final result = await showDialog<Json>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Form(
            key: form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final entry in fields.entries)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: TextFormField(
                      controller: controllers[entry.key],
                      decoration: InputDecoration(labelText: entry.value),
                      minLines: 1,
                      maxLines:
                          entry.key == 'text' || entry.key == 'description'
                          ? 5
                          : 1,
                      maxLength: limits[entry.key] ?? maxLength,
                      validator: (value) =>
                          !optional.contains(entry.key) &&
                              (value == null || value.trim().isEmpty)
                          ? 'Заповніть поле'
                          : null,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Скасувати'),
        ),
        FilledButton(
          onPressed: () {
            if (form.currentState!.validate())
              Navigator.pop(context, <String, dynamic>{
                for (final e in controllers.entries) e.key: e.value.text.trim(),
              });
          },
          child: const Text('Зберегти'),
        ),
      ],
    ),
  );
  // A route can still be animating out; controllers are local to its widgets.
  Future.delayed(const Duration(seconds: 1), () {
    for (final c in controllers.values) {
      c.dispose();
    }
  });
  return result;
}

Future<bool> confirm(BuildContext context, String text) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(text),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Скасувати'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Підтвердити'),
          ),
        ],
      ),
    ) ??
    false;

class AsyncAction extends StatefulWidget {
  final Future<void> Function() onPressed;
  final Widget child;
  const AsyncAction({super.key, required this.onPressed, required this.child});
  @override
  State<AsyncAction> createState() => _AsyncActionState();
}

class _AsyncActionState extends State<AsyncAction> {
  bool busy = false;
  @override
  Widget build(BuildContext context) => FilledButton(
    onPressed: busy
        ? null
        : () async {
            setState(() => busy = true);
            try {
              await widget.onPressed();
            } catch (e) {
              if (mounted) showError(context, e);
            } finally {
              if (mounted) setState(() => busy = false);
            }
          },
    child: busy
        ? const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : widget.child,
  );
}
