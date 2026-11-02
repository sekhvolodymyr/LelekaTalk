import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:uuid/uuid.dart';
import 'package:http/io_client.dart';
import 'package:lelekatalk_mobile/api.dart';
import 'package:lelekatalk_mobile/vault.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'Web → Dart → shared API → Web: signed encrypted messages, recovery and new native keys',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final server = await Process.start('node', ['tool/interop-server.mjs']);
      final lines = StreamIterator(
        server.stdout.transform(utf8.decoder).transform(const LineSplitter()),
      );
      final errors = StringBuffer();
      server.stderr.transform(utf8.decoder).listen(errors.write);
      addTearDown(() async {
        server.stdin.writeln(jsonEncode({'action': 'exit'}));
        await server.stdin.flush();
        await server.stdin.close();
        await server.exitCode.timeout(
          const Duration(seconds: 10),
          onTimeout: () {
            server.kill();
            return -1;
          },
        );
      });
      expect(await lines.moveNext(), isTrue, reason: errors.toString());
      final fixture = jsonDecode(lines.current) as Json;
      final api = Api(
        baseUrl: fixture['origin'],
        client: IOClient(
          HttpOverrides.runWithHttpOverrides(
            () => HttpClient(),
            _RealNetwork(),
          ),
        ),
      );
      final user = (await api.post('login', {
        'email': fixture['user']['email'],
        'password': 'test-password-123456',
      }))['user'];
      final vault = Vault(api);
      expect(await vault.open(user), isNull);
      expect(vault.unlocked, isFalse);
      await vault.unlock(fixture['code']);
      expect(vault.unlocked, isTrue);
      final chat = fixture['chat'] as Json;
      final received = await api.get('mvp/chats/${chat['id']}/messages');
      final message = (received['messages'] as List).single as Json;
      final expected = fixture['payload'] as Json;
      expect(
        await vault.decrypt(message['ciphertext'], fixture['alice'], {
          'kind': 'message',
          'id': expected['id'],
          'chatId': chat['id'],
          'senderId': fixture['alice']['id'],
        }, received['serverTime']),
        expected,
      );
      await expectLater(
        vault.decrypt(message['ciphertext'], fixture['alice'], {
          'chatId': const Uuid().v4(),
        }, received['serverTime']),
        throwsStateError,
      );
      await expectLater(
        vault.decrypt(
          message['ciphertext'],
          vault.identity!,
          {},
          received['serverTime'],
        ),
        throwsStateError,
      );
      final id = const Uuid().v4(),
          outgoing = <String, dynamic>{
            'kind': 'message',
            'id': id,
            'chatId': chat['id'],
            'senderId': user['id'],
            'text': 'Привіт із Flutter 📱',
          };
      final encrypted = await vault.encrypt(outgoing, [fixture['alice']]);
      await api.post('mvp/chats/${chat['id']}/messages', {
        'id': id,
        'revision': chat['revision'],
        'ciphertext': encrypted,
      });
      server.stdin.writeln(
        jsonEncode({'action': 'verify', 'ciphertext': encrypted}),
      );
      await server.stdin.flush();
      expect(await lines.moveNext(), isTrue);
      expect((jsonDecode(lines.current) as Json)['payload'], outgoing);
      server.stdin.writeln(jsonEncode({'action': 'read'}));
      await server.stdin.flush();
      expect(await lines.moveNext(), isTrue);
      final messages = (jsonDecode(lines.current)['messages'] as List)
          .cast<Json>();
      expect(messages.last['id'], id);
      expect(messages.last.containsKey('text'), isFalse);
      // Device restart opens the same vault from Keystore-backed recovery material.
      final restored = Vault(api);
      await restored.open(user);
      expect(restored.unlocked, isTrue);
      await restored.close();
      await expectLater(
        restored.encrypt({'kind': 'message'}),
        throwsStateError,
      );
      // New mobile registrations must also produce keys readable by the web app.
      final nativeUser = (await api.post('register', {
        'email': 'native@example.test',
        'username': 'native_account',
        'name': 'Native',
        'password': 'native-password-123456',
        'ageConfirmed': true,
      }))['user'];
      final native = Vault(api);
      final code = await native.open(nativeUser);
      expect(code, isNotNull);
      final payload = <String, dynamic>{
        'kind': 'plan',
        'id': const Uuid().v4(),
        'title': 'Подія з телефону',
      };
      final sealed = await native.encrypt(payload);
      server.stdin.writeln(
        jsonEncode({
          'action': 'verify-new-key',
          'publicKey': native.identity!['publicKey'],
          'privateKey': native.identity!['encryptedPrivateKey'],
          'code': code,
          'ciphertext': sealed,
        }),
      );
      await server.stdin.flush();
      expect(await lines.moveNext(), isTrue);
      expect((jsonDecode(lines.current) as Json)['payload'], payload);
    },
    timeout: const Timeout(Duration(minutes: 3)),
  );
}

class _RealNetwork extends HttpOverrides {}
