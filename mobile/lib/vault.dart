import 'dart:convert';
import 'dart:math';

import 'package:dart_pg/dart_pg.dart';
import 'package:dart_pg/src/type/key.dart';

import 'api.dart';

/// The same signed OpenPGP envelopes as phase-one/public/crypto.js.
/// No server/database key or plaintext private content is sent to the backend.
class Vault {
  final Api api;
  Json? identity;
  PrivateKeyInterface? _privateKey;
  int _epoch = 0;
  bool remembered = true;
  Vault(this.api);
  bool get unlocked => _privateKey != null;
  static String fingerprint(KeyInterface key) =>
      key.fingerprint.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  String get _deviceKey => 'vault:${api.origin.origin}:${identity!['id']}';
  String get _fingerprint => identity!['fingerprint'];
  Future<DateTime> now({bool creating = false}) async {
    final response = await api.get('mvp/time');
    return DateTime.fromMillisecondsSinceEpoch(
      response['serverTime'] - (creating ? 5000 : 0),
      isUtc: true,
    );
  }

  void _guard(int epoch) {
    if (epoch != _epoch) throw StateError('keys_locked');
  }

  Future<String?> open(Json user) async {
    final epoch = ++_epoch;
    _privateKey = null;
    final result = await api.get('mvp/crypto');
    _guard(epoch);
    Json? vault = result['vault'];
    String? recovery;
    if (vault == null) {
      final random = Random.secure();
      final hex = List.generate(
        32,
        (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0'),
      ).join().toUpperCase();
      recovery = List.generate(
        8,
        (i) => hex.substring(i * 8, i * 8 + 8),
      ).join('-');
      final key = OpenPGP.generateKey(
        ['@${user['username']}'],
        recovery,
        type: KeyType.ecc,
        curve: Ecc.ed25519,
        time: DateTime.fromMillisecondsSinceEpoch(
          result['serverTime'] - 5000,
          isUtc: true,
        ),
      );
      _guard(epoch);
      vault = (await api.post('mvp/crypto', {
        'publicKey': key.publicKey.armor(),
        'encryptedPrivateKey': key.armor(),
      }))['vault'];
      _guard(epoch);
    }
    identity = {'id': user['id'], 'name': user['personalName'], ...vault!};
    if (recovery != null) {
      await unlock(recovery);
    } else {
      final saved = await api.storage.read(key: _deviceKey);
      _guard(epoch);
      if (saved != null) {
        final key = OpenPGP.decryptPrivateKey(
          identity!['encryptedPrivateKey'],
          saved,
        );
        if (fingerprint(key) != _fingerprint.toLowerCase())
          throw StateError('key_changed');
        _privateKey = key;
      }
    }
    return recovery;
  }

  Future<void> unlock(String code) async {
    final epoch = _epoch;
    final normalized = code.trim().toUpperCase().replaceAll(RegExp(r'\s'), '');
    final key = OpenPGP.decryptPrivateKey(
      identity!['encryptedPrivateKey'],
      normalized,
    );
    if (fingerprint(key) != _fingerprint.toLowerCase())
      throw StateError('key_changed');
    _guard(epoch);
    _privateKey = key;
    final deviceKey = _deviceKey;
    try {
      await api.storage.write(key: deviceKey, value: normalized);
      remembered = true;
    } catch (_) {
      // A newly generated recovery code must still reach the user if Android
      // storage is temporarily unavailable. Keep the key in memory this session.
      remembered = false;
    }
    if (epoch != _epoch) {
      await api.storage.delete(key: deviceKey);
      _guard(epoch);
    }
  }

  Future<void> close() async {
    _epoch++;
    final key = identity == null ? null : _deviceKey;
    _privateKey = null;
    identity = null;
    if (key != null) await api.storage.delete(key: key);
  }

  Future<KeyInterface> publicKey(Json person) async {
    final epoch = _epoch;
    final fingerprint = (person['fingerprint'] as String).toLowerCase();
    if (person['id'] == identity!['id']) {
      final ownKey = OpenPGP.readPublicKey(person['publicKey']);
      if (fingerprint != _fingerprint.toLowerCase() ||
          Vault.fingerprint(ownKey) != fingerprint) {
        throw StateError('key_changed');
      }
      return ownKey;
    }
    final pin = 'peer:${api.origin.origin}:${identity!['id']}:${person['id']}';
    final previous = await api.storage.read(key: pin);
    _guard(epoch);
    if (previous != null && previous != fingerprint)
      throw StateError('key_changed');
    final key = OpenPGP.readPublicKey(person['publicKey']);
    if (Vault.fingerprint(key) != fingerprint) throw StateError('key_changed');
    await api.storage.write(key: pin, value: fingerprint);
    _guard(epoch);
    return key;
  }

  Future<String> encrypt(
    Json envelope, [
    List<Json> recipients = const [],
  ]) async {
    if (!unlocked) throw StateError('keys_locked');
    final epoch = _epoch, privateKey = _privateKey!;
    final date = await now(creating: true);
    final people = <String, Json>{
      for (final person in [...recipients, identity!]) person['id']: person,
    };
    final keys = <KeyInterface>[];
    for (final person in people.values) {
      keys.add(await publicKey(person));
    }
    _guard(epoch);
    return OpenPGP.encryptCleartext(
      jsonEncode(envelope),
      encryptionKeys: keys,
      signingKeys: [privateKey],
      time: date,
    ).armor();
  }

  Future<Json> decrypt(
    String ciphertext,
    Json sender,
    Json expected, [
    int? serverTime,
  ]) async {
    if (!unlocked) throw StateError('keys_locked');
    final epoch = _epoch, privateKey = _privateKey!;
    if (ciphertext.length > 96000) throw StateError('invalid_payload');
    final date = serverTime == null
        ? await now()
        : DateTime.fromMillisecondsSinceEpoch(serverTime, isUtc: true);
    final key = await publicKey(sender);
    _guard(epoch);
    final message = OpenPGP.decrypt(ciphertext, decryptionKeys: [privateKey]);
    final verified = message.verify([key], date).toList();
    if (verified.isEmpty || verified.any((v) => !v.isVerified))
      throw StateError('invalid_signature');
    // dart_pg emits binary literal packets even for encryptCleartext; the web
    // library emits UTF-8 packets. Both carry the same signed JSON bytes.
    final literal = message.literalData;
    final text = literal.text.isNotEmpty
        ? literal.text
        : utf8.decode(literal.binary);
    if (text.length > 32000) throw StateError('invalid_payload');
    final payload = jsonDecode(text) as Json;
    for (final entry in expected.entries) {
      if (payload[entry.key] != entry.value)
        throw StateError('invalid_payload');
    }
    _guard(epoch);
    return payload;
  }
}
