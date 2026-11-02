import 'dart:async';
import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

typedef Json = Map<String, dynamic>;

class ApiException implements Exception {
  final int status;
  final String code;
  ApiException(this.status, this.code);
  @override
  String toString() => messages[code] ?? 'Не вдалося виконати дію ($code).';
  static const messages = {
    'invalid_credentials': 'Неправильний email або пароль.',
    'authentication_required': 'Увійдіть в акаунт ще раз.',
    'account_conflict': 'Email або username вже використовується.',
    'invalid_password': 'Пароль має містити від 12 до 256 символів.',
    'invalid_username': 'Username: 3–24 латинські літери, цифри або _.',
    'invalid_email': 'Перевірте email.',
    'too_many_attempts': 'Забагато спроб. Зачекайте хвилину.',
    'members_changed': 'Склад чату змінився. Оновіть чат і повторіть.',
    'call_busy': 'Співрозмовник уже розмовляє.',
    'stream_full': 'В ефірі вже 5 глядачів.',
    'network': 'Немає з’єднання. Перевірте інтернет і повторіть.',
  };
}

class Api {
  static const production = 'https://lelekatalk.vercel.app';
  final Uri origin;
  final http.Client client;
  final FlutterSecureStorage storage;
  String? _cookie;
  int _epoch = 0;
  void Function()? onExpired;
  Api({
    String baseUrl = const String.fromEnvironment(
      'API_BASE_URL',
      defaultValue: production,
    ),
    http.Client? client,
    FlutterSecureStorage? storage,
  }) : origin = Uri.parse(baseUrl),
       client = client ?? http.Client(),
       storage = storage ?? const FlutterSecureStorage() {
    if (origin.scheme != 'https' &&
        !(origin.scheme == 'http' &&
            ['127.0.0.1', 'localhost', '10.0.2.2'].contains(origin.host))) {
      throw ArgumentError('HTTPS required');
    }
    if (origin.path.isNotEmpty && origin.path != '/')
      throw ArgumentError('Origin only');
  }
  String get sessionKey => 'session:${origin.origin}';
  Future<void> restore() async {
    _cookie = await storage.read(key: sessionKey);
  }

  Future<void> forget() async {
    _epoch++;
    _cookie = null;
    await storage.delete(key: sessionKey);
  }

  Future<Json> request(String path, {String method = 'GET', Json? body}) async {
    final epoch = _epoch;
    final request = http.Request(method, origin.resolve('/api/$path'));
    request.followRedirects = false;
    request.headers.addAll({
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Origin': origin.origin,
      if (_cookie != null) 'Cookie': _cookie!,
    });
    if (method != 'GET') request.body = jsonEncode(body ?? <String, dynamic>{});
    late http.Response response;
    try {
      response = await http.Response.fromStream(
        await client.send(request).timeout(const Duration(seconds: 25)),
      ).timeout(const Duration(seconds: 25));
    } catch (_) {
      throw ApiException(0, 'network');
    }
    if (epoch != _epoch) throw StateError('Session changed');
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null) {
      final match = RegExp(
        r'leleka_session=([a-f0-9]{64})(?:;|$)',
      ).firstMatch(setCookie);
      if (match != null) {
        _cookie = 'leleka_session=${match[1]}';
        await storage.write(key: sessionKey, value: _cookie);
      }
    }
    Json result;
    try {
      result = jsonDecode(utf8.decode(response.bodyBytes)) as Json;
    } catch (_) {
      throw ApiException(response.statusCode, 'invalid_response');
    }
    if (response.statusCode >= 400) {
      if (response.statusCode == 401 && path != 'login') {
        await forget();
        onExpired?.call();
      }
      throw ApiException(
        response.statusCode,
        result['error'] ?? 'server_error',
      );
    }
    if (response.statusCode >= 300)
      throw ApiException(response.statusCode, 'unexpected_redirect');
    return result;
  }

  Future<Json> get(String path) => request(path);
  Future<Json> post(String path, [Json? body]) =>
      request(path, method: 'POST', body: body);
  Future<Json> patch(String path, Json body) =>
      request(path, method: 'PATCH', body: body);
  Future<Json> delete(String path) => request(path, method: 'DELETE');
}
