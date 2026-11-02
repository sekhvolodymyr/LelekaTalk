import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'vault.dart';
import 'theme.dart';

class Session extends ChangeNotifier {
  final Api api;
  late final Vault vault;
  Json? user;
  String? recovery, startupError;
  bool starting = true;
  int epoch = 0;
  LelekaPalette palette = LelekaPalette.all.first;
  String language = 'uk';
  Session({Api? api}) : api = api ?? Api() {
    vault = Vault(this.api);
    this.api.onExpired = () {
      epoch++;
      user = null;
      vault.close();
      notifyListeners();
    };
  }
  Future<void> initialize() async {
    starting = true;
    startupError = null;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      palette = LelekaPalette.all.firstWhere(
        (p) => p.id == prefs.getString('theme'),
        orElse: () => LelekaPalette.all.first,
      );
      language = prefs.getString('language') ?? 'uk';
      await api.restore();
      try {
        user = (await api.get('me'))['user'];
        recovery = await vault.open(user!);
      } on ApiException catch (error) {
        if (error.status != 401) rethrow;
      }
    } catch (error) {
      startupError = error.toString();
    }
    starting = false;
    notifyListeners();
  }

  Future<void> authenticate(Json fields, bool register) async {
    final result = await api.post(register ? 'register' : 'login', fields);
    user = result['user'];
    epoch++;
    try {
      recovery = await vault.open(user!);
    } finally {
      notifyListeners();
    }
  }

  Future<void> unlock(String code) async {
    await vault.unlock(code);
    notifyListeners();
  }

  void acknowledgeRecovery() {
    recovery = null;
    notifyListeners();
  }

  Future<void> profile(Json fields) async {
    user = (await api.patch('profile', fields))['user'];
    notifyListeners();
  }

  Future<void> theme(LelekaPalette value) async {
    palette = value;
    notifyListeners();
    await (await SharedPreferences.getInstance()).setString('theme', value.id);
  }

  Future<void> logout() async {
    // Do not silently retain a server session if revocation fails offline.
    await api.post('logout');
    epoch++;
    user = null;
    recovery = null;
    await vault.close();
    await api.forget();
    notifyListeners();
  }
}
