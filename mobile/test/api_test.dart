import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:lelekatalk_mobile/api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  test(
    'session persists, writes use web origin, redirects cannot leak cookies',
    () async {
      final token = List.filled(64, 'a').join();
      var requests = 0;
      final api = Api(
        client: MockClient((request) async {
          requests++;
          expect(request.headers['Origin'], Api.production);
          expect(request.followRedirects, isFalse);
          if (requests == 1) {
            expect(jsonDecode(request.body)['password'], 'test');
            return http.Response(
              '{"user":{"id":"1"}}',
              200,
              headers: {
                'set-cookie':
                    'leleka_session=$token; HttpOnly; Secure; SameSite=Strict',
              },
            );
          }
          expect(request.headers['Cookie'], 'leleka_session=$token');
          return http.Response('{"user":{"id":"1"}}', 200);
        }),
      );
      await api.post('login', {'password': 'test'});
      await api.get('me');
      final restored = Api(client: api.client);
      await restored.restore();
      await restored.get('me');
      await api.forget();
      expect(await api.storage.read(key: api.sessionKey), isNull);
    },
  );
  test('401 revokes cached session and notifies the session owner', () async {
    var expired = false;
    final api = Api(
      client: MockClient(
        (_) async => http.Response('{"error":"authentication_required"}', 401),
      ),
    );
    api.onExpired = () => expired = true;
    await expectLater(api.get('me'), throwsA(isA<ApiException>()));
    expect(expired, isTrue);
  });
  test('cleartext remote API hosts are rejected', () {
    expect(() => Api(baseUrl: 'http://example.com'), throwsArgumentError);
  });
}
