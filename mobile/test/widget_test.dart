import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lelekatalk_mobile/api.dart';
import 'package:lelekatalk_mobile/chats.dart';
import 'package:lelekatalk_mobile/main.dart';
import 'package:lelekatalk_mobile/rtc.dart';
import 'package:lelekatalk_mobile/session.dart';
import 'package:lelekatalk_mobile/theme.dart';

class RouteTestSession extends Session {
  @override
  Future<void> initialize() async {
    starting = false;
  }

  void expire() {
    epoch++;
    user = null;
    notifyListeners();
  }
}

void main() {
  setUpAll(() async {
    final fonts = FontLoader('Leleka')
      ..addFont(rootBundle.load('assets/fonts/roboto-regular.ttf'));
    await fonts.load();
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  testWidgets('expired sessions remove all previously opened private routes', (
    tester,
  ) async {
    final session = RouteTestSession();
    await tester.pumpWidget(LelekaApp(session: session));
    await tester.pumpAndSettle();
    final navigator = Navigator.of(tester.element(find.byType(AuthScreen)));
    navigator.push(
      MaterialPageRoute<void>(
        builder: (_) => const Scaffold(body: Text('Synthetic private screen')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Synthetic private screen'), findsOneWidget);
    session.expire();
    await tester.pumpAndSettle();
    expect(find.text('Synthetic private screen'), findsNothing);
    expect(find.byType(AuthScreen), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'native authentication fits phone widths and exposes registration fields',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(390, 844);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final session = Session();
      await tester.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: session.palette.theme,
          home: AuthScreen(session),
        ),
      );
      await tester.runAsync(
        () => precacheImage(
          const AssetImage('assets/logo.png'),
          tester.element(find.byType(AuthScreen)),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Раді бачити тебе'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/login.png'),
      );
      await tester.tap(find.text('Ще немає акаунта? Створити акаунт'));
      await tester.pumpAndSettle();
      expect(find.text('Твоє ім’я'), findsOneWidget);
      expect(find.text('Мені виповнилося 16 років'), findsOneWidget);
      tester.view.physicalSize = const Size(360, 640);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox());
    },
  );
  testWidgets('all web palettes render native chat lists without overflow', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 844);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final api = Api(
      client: MockClient(
        (_) async => http.Response(
          jsonEncode({
            'chats': [
              {
                'id': 'synthetic',
                'type': 'direct',
                'members': [
                  {'id': 'other', 'name': 'Олена'},
                ],
                'messageCount': 3,
                'myStatus': 'accepted',
              },
              {
                'id': 'synthetic-group',
                'type': 'group',
                'title': 'Спільні ідеї',
                'messageCount': 5,
                'myStatus': 'invited',
              },
            ],
          }),
          200,
          headers: {'content-type': 'application/json; charset=utf-8'},
        ),
      ),
    );
    final session = Session(api: api)
      ..user = {'id': 'self', 'personalName': 'Тест'};
    final calls = Calls(session);
    for (final palette in LelekaPalette.all) {
      await tester.pumpWidget(
        MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: palette.theme,
          home: Scaffold(
            appBar: AppBar(title: const Text('Чати')),
            body: Chats(session, calls: calls),
          ),
        ),
      );
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));
      expect(
        find.text('Олена'),
        findsOneWidget,
        reason: tester
            .widgetList<Text>(find.byType(Text))
            .map((t) => t.data)
            .join('|'),
      );
      expect(tester.takeException(), isNull, reason: palette.id);
      if (palette.id == 'light')
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/chats.png'),
        );
    }
    await tester.pumpWidget(const SizedBox());
  });
}
