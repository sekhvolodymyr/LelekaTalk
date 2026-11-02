import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'session.dart';
import 'shell.dart';
import 'widgets.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(LelekaApp());
}

class LelekaApp extends StatefulWidget {
  final Session? session;
  const LelekaApp({super.key, this.session});
  @override
  State<LelekaApp> createState() => _LelekaAppState();
}

class _LelekaAppState extends State<LelekaApp> {
  late final session = widget.session ?? Session();
  @override
  void initState() {
    super.initState();
    session.initialize();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: session,
    builder: (context, _) => MaterialApp(
      title: 'LelekaTalk',
      debugShowCheckedModeBanner: false,
      theme: session.palette.theme,
      locale: Locale(session.language),
      supportedLocales: const [Locale('uk'), Locale('en')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      home: session.starting
          ? const Scaffold(body: Center(child: CircularProgressIndicator()))
          : session.startupError != null
          ? Scaffold(
              body: EmptyState(
                'Не вдалося підключитися',
                session.startupError!,
                action: AsyncAction(
                  onPressed: session.initialize,
                  child: const Text('Повторити'),
                ),
              ),
            )
          : session.user == null
          ? AuthScreen(session)
          : Shell(
              session,
              key: ValueKey('${session.user!['id']}:${session.epoch}'),
            ),
    ),
  );
}

class AuthScreen extends StatefulWidget {
  final Session session;
  const AuthScreen(this.session, {super.key});
  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  bool register = false, age = false, obscure = true;
  final form = GlobalKey<FormState>();
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController(),
      username = TextEditingController();
  @override
  void dispose() {
    for (final c in [email, password, name, username]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(25),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Form(
              key: form,
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Row(
                      children: [
                        Logo(),
                        SizedBox(width: 12),
                        Text(
                          'LelekaTalk',
                          style: TextStyle(
                            fontSize: 25,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 48),
                    Text(
                      register ? 'Створи свій простір' : 'Раді бачити тебе',
                      style: Theme.of(context).textTheme.headlineMedium,
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'Спілкуйся. Створюй. Будь собою.',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 30),
                    if (register) ...[
                      TextFormField(
                        controller: name,
                        maxLength: 60,
                        decoration: const InputDecoration(
                          labelText: 'Твоє ім’я',
                        ),
                        validator: required,
                      ),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: username,
                        maxLength: 24,
                        autocorrect: false,
                        decoration: const InputDecoration(
                          labelText: 'Ім’я користувача',
                        ),
                        validator: (v) =>
                            RegExp(r'^[a-z0-9_]{3,24}$').hasMatch(v ?? '')
                            ? null
                            : '3–24 латинські літери, цифри або _',
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextFormField(
                      controller: email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      autocorrect: false,
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: required,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: password,
                      obscureText: obscure,
                      maxLength: 256,
                      autofillHints: [
                        register
                            ? AutofillHints.newPassword
                            : AutofillHints.password,
                      ],
                      decoration: InputDecoration(
                        labelText: 'Пароль',
                        helperText: register ? 'Щонайменше 12 символів' : null,
                        suffixIcon: IconButton(
                          tooltip: 'Показати пароль',
                          onPressed: () => setState(() => obscure = !obscure),
                          icon: const Icon(Icons.visibility_outlined),
                        ),
                      ),
                      validator: (v) =>
                          v == null || v.isEmpty || register && v.length < 12
                          ? 'Перевірте пароль'
                          : null,
                    ),
                    if (register)
                      CheckboxListTile(
                        contentPadding: EdgeInsets.zero,
                        value: age,
                        onChanged: (v) => setState(() => age = v!),
                        title: const Text('Мені виповнилося 16 років'),
                      ),
                    const SizedBox(height: 20),
                    AsyncAction(
                      onPressed: () async {
                        if (!form.currentState!.validate()) return;
                        if (register && !age) {
                          showError(context, 'Підтвердьте свій вік.');
                          return;
                        }
                        await widget.session.authenticate({
                          'email': email.text.trim(),
                          'password': password.text,
                          if (register) ...{
                            'name': name.text.trim(),
                            'username': username.text.trim(),
                            'ageConfirmed': age,
                          },
                        }, register);
                        password.clear();
                      },
                      child: Text(register ? 'Створити акаунт' : 'Увійти'),
                    ),
                    const SizedBox(height: 14),
                    TextButton(
                      onPressed: () => setState(() => register = !register),
                      child: Text(
                        register
                            ? 'Уже маєш акаунт? Увійти'
                            : 'Ще немає акаунта? Створити акаунт',
                      ),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'MVP · підтвердження email ще не підключене',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 11, color: Colors.grey),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
  String? required(String? v) =>
      v == null || v.trim().isEmpty ? 'Заповніть поле' : null;
}
