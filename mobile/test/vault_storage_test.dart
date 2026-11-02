import 'dart:convert';
import 'package:dart_pg/dart_pg.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lelekatalk_mobile/api.dart';
import 'package:lelekatalk_mobile/vault.dart';

class UnavailableStorage extends FlutterSecureStorage {
  @override
  Future<void> write({
    required String key,
    required String? value,
    IOSOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    MacOsOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    throw StateError('Simulated device storage failure');
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'new recovery code is shown and key stays usable if Android secure storage fails',
    () async {
      FlutterSecureStorage.setMockInitialValues({});
      final api = Api(
        storage: UnavailableStorage(),
        client: MockClient((request) async {
          if (request.method == 'POST') {
            final body = jsonDecode(request.body) as Json;
            return http.Response(
              jsonEncode({
                'vault': {
                  ...body,
                  'fingerprint': Vault.fingerprint(
                    OpenPGP.readPublicKey(body['publicKey']),
                  ),
                },
              }),
              201,
            );
          }
          return http.Response(
            jsonEncode({
              'vault': null,
              'serverTime': DateTime.now().millisecondsSinceEpoch,
            }),
            200,
          );
        }),
      );
      final vault = Vault(api);
      final code = await vault.open({
        'id': 'synthetic-user',
        'username': 'native',
      });
      expect(code, matches(RegExp(r'^[A-F0-9]{8}(-[A-F0-9]{8}){7}$')));
      expect(vault.remembered, isFalse);
      expect(vault.unlocked, isTrue);
      final encrypted = await vault.encrypt({
        'kind': 'plan',
        'id': 'test',
        'title': 'Private',
      });
      expect(
        await vault.decrypt(encrypted, vault.identity!, {
          'kind': 'plan',
          'id': 'test',
        }),
        {'kind': 'plan', 'id': 'test', 'title': 'Private'},
      );
    },
  );
}
