import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'session.dart';
import 'widgets.dart';

/// Foreground calling with the web client's authenticated, encrypted signalling.
class Calls extends ChangeNotifier {
  final Session session;
  final deviceId = const Uuid().v4();
  Json? call;
  RTCPeerConnection? pc;
  MediaStream? stream;
  final local = RTCVideoRenderer(), remote = RTCVideoRenderer();
  Timer? _poll, _heartbeat, _deadline;
  final _seen = <String>{};
  final _candidates = <Json>[], _remoteCandidates = <Json>[];
  bool _polling = false,
      _registered = false,
      _flushing = false,
      _busy = false,
      _closed = false;
  bool muted = false, cameraOff = false, foreground = true;
  String phase = 'Підключення…';
  int _generation = 0;
  Calls(this.session);
  bool get outgoing => call?['callerId'] == session.user?['id'];
  Json get peer => call![outgoing ? 'callee' : 'caller'];
  bool get video => call?['media'] == 'video';
  Future<Json> post(String path, [Json body = const {}]) =>
      session.api.post('mvp/calls$path', {...body, 'deviceId': deviceId});
  Future<void> start() async {
    await local.initialize();
    await remote.initialize();
    if (_closed) return;
    _poll = Timer.periodic(const Duration(seconds: 2), (_) => poll());
    await poll();
  }

  Future<void> poll() async {
    if (_closed ||
        _polling ||
        _busy ||
        !foreground ||
        !session.vault.unlocked ||
        session.user == null)
      return;
    final generation = _generation;
    _polling = true;
    try {
      final result = await session.api.get('mvp/calls?device=$deviceId');
      if (_closed || generation != _generation || _busy) return;
      final values = (result['calls'] as List).cast<Json>();
      if (call == null) {
        final incoming = values
            .where(
              (c) =>
                  c['status'] == 'ringing' &&
                  c['calleeId'] == session.user!['id'],
            )
            .firstOrNull;
        if (incoming != null) {
          call = incoming;
          phase = 'Вхідний ${video ? 'відео' : 'аудіо'}дзвінок';
          notifyListeners();
        }
        return;
      }
      final current = values.where((c) => c['id'] == call!['id']).firstOrNull;
      if (current == null || current['status'] == 'ended') {
        await release();
        call = null;
        notifyListeners();
        return;
      }
      call = current;
      if (outgoing &&
          current['answer'] != null &&
          pc != null &&
          await pc!.getRemoteDescription() == null) {
        final description = await readDescription(
          'answer',
          current['answer'],
          peer,
          result['serverTime'],
        );
        if (generation != _generation) return;
        await pc!.setRemoteDescription(
          RTCSessionDescription(description['sdp'], 'answer'),
        );
        phase = 'З’єднуємо…';
      }
      if (pc != null) {
        for (final message in (current['signals'] as List).cast<Json>()) {
          if (message['senderId'] == session.user!['id'] ||
              _seen.contains(message['id']))
            continue;
          final payload = await session.vault
              .decrypt(message['ciphertext'], peer, {
                'kind': 'call-signal',
                'id': message['id'],
                'callId': current['id'],
                'senderId': peer['id'],
                'type': 'ice',
              }, result['serverTime']);
          if (generation != _generation) return;
          final candidates = (payload['candidates'] as List).cast<Json>();
          if (candidates.length > 20) throw StateError('invalid_signal');
          for (final c in candidates) {
            if ((c['candidate'] as String).length > 4096)
              throw StateError('invalid_signal');
            _remoteCandidates.add(c);
          }
          _seen.add(message['id']);
        }
        if (await pc!.getRemoteDescription() != null) {
          while (_remoteCandidates.isNotEmpty) {
            final c = _remoteCandidates.removeAt(0);
            await pc!.addCandidate(
              RTCIceCandidate(c['candidate'], c['sdpMid'], c['sdpMLineIndex']),
            );
          }
        }
      }
      notifyListeners();
    } catch (error) {
      if (call != null &&
          error is ApiException &&
          [401, 403, 409].contains(error.status)) {
        await release();
        call = null;
        notifyListeners();
      }
    } finally {
      _polling = false;
    }
  }

  Future<bool> makePeer(int generation) async {
    final withVideo = video;
    final config = await session.api.get('mvp/calls/config');
    if (_closed || generation != _generation) return false;
    final connection = await createPeerConnection({
      'iceServers': config['iceServers'],
      'sdpSemantics': 'unified-plan',
    });
    if (_closed || generation != _generation) {
      await connection.close();
      return false;
    }
    pc = connection;
    final captured = await navigator.mediaDevices.getUserMedia({
      'audio': true,
      'video': withVideo
          ? {'facingMode': 'user', 'width': 640, 'height': 480}
          : false,
    });
    if (_closed || generation != _generation || pc != connection) {
      for (final track in captured.getTracks()) {
        await track.stop();
      }
      await captured.dispose();
      await connection.close();
      return false;
    }
    stream = captured;
    local.srcObject = stream;
    for (final track in stream!.getTracks()) {
      await connection.addTrack(track, stream!);
    }
    connection.onTrack = (event) {
      if (pc == connection && event.streams.isNotEmpty) {
        remote.srcObject = event.streams.first;
        notifyListeners();
      }
    };
    connection.onIceCandidate = (candidate) {
      if (pc != connection ||
          candidate.candidate == null ||
          candidate.candidate!.isEmpty)
        return;
      _candidates.add(candidate.toMap().cast<String, dynamic>());
      flush();
    };
    connection.onConnectionState = (state) {
      if (pc != connection) return;
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        phase = 'Розмова';
        _deadline?.cancel();
        notifyListeners();
      }
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed)
        hangup(reason: 'failed');
    };
    return generation == _generation && !_closed;
  }

  Future<String> description(String type, RTCSessionDescription value) =>
      session.vault.encrypt(
        {
          'kind': 'call-description',
          'callId': call!['id'],
          'senderId': session.user!['id'],
          'type': type,
          'media': call!['media'],
          'description': {'type': type, 'sdp': value.sdp},
        },
        [call!['caller'], call!['callee']],
      );
  Future<Json> readDescription(
    String type,
    String ciphertext,
    Json sender,
    int? time,
  ) async {
    final current = call!;
    final payload = await session.vault.decrypt(ciphertext, sender, {
      'kind': 'call-description',
      'callId': current['id'],
      'senderId': sender['id'],
      'type': type,
    }, time);
    final Json value = payload['description'];
    final signedMedia = payload['media'] ?? 'audio';
    if (signedMedia != (current['media'] ?? 'audio') ||
        value['type'] != type ||
        value['sdp'] is! String ||
        (value['sdp'] as String).length > 24000 ||
        RegExp(r'(?:^|\r?\n)m=video\s').hasMatch(value['sdp']) !=
            (current['media'] == 'video')) {
      throw StateError('invalid_call_description');
    }
    return value;
  }

  Future<void> flush() async {
    if (_flushing || !_registered || call == null || pc == null) return;
    final generation = _generation;
    _flushing = true;
    try {
      while (_candidates.isNotEmpty &&
          generation == _generation &&
          call != null) {
        final batch = _candidates.take(20).toList();
        _candidates.removeRange(0, batch.length);
        final id = const Uuid().v4(), callId = call!['id'];
        final ciphertext = await session.vault.encrypt(
          {
            'kind': 'call-signal',
            'id': id,
            'callId': callId,
            'senderId': session.user!['id'],
            'type': 'ice',
            'candidates': batch,
          },
          [call!['caller'], call!['callee']],
        );
        if (generation != _generation) return;
        await post('/$callId/signals', {'id': id, 'ciphertext': ciphertext});
      }
    } catch (_) {
      if (generation == _generation) await hangup(reason: 'failed');
    } finally {
      _flushing = false;
    }
  }

  void heartbeat() {
    _heartbeat?.cancel();
    _heartbeat = Timer.periodic(const Duration(seconds: 15), (_) async {
      if (call == null || !_registered) return;
      try {
        await post('/${call!['id']}/heartbeat');
      } catch (_) {
        await hangup(reason: 'failed');
      }
    });
    _deadline = Timer(const Duration(seconds: 40), () {
      if (phase != 'Розмова') hangup(reason: 'failed');
    });
  }

  Future<void> dial(Json chat, bool withVideo) async {
    if (call != null || _busy) throw StateError('Дзвінок уже триває.');
    _busy = true;
    final generation = ++_generation;
    final callee = (chat['members'] as List).cast<Json>().firstWhere(
      (m) => m['id'] != session.user!['id'] && m['status'] == 'accepted',
    );
    call = {
      'id': const Uuid().v4(),
      'chatId': chat['id'],
      'media': withVideo ? 'video' : 'audio',
      'callerId': session.user!['id'],
      'calleeId': callee['id'],
      'caller': session.vault.identity,
      'callee': callee,
      'status': 'ringing',
    };
    phase = 'Телефонуємо…';
    notifyListeners();
    try {
      if (!await makePeer(generation)) return;
      final offer = await pc!.createOffer();
      if (generation != _generation) return;
      await pc!.setLocalDescription(offer);
      if (generation != _generation) return;
      final current = call!;
      final encrypted = await description('offer', offer);
      if (generation != _generation) return;
      final result = await post('', {
        'id': current['id'],
        'chatId': chat['id'],
        'media': current['media'],
        'offer': encrypted,
      });
      if (generation != _generation) {
        await post('/${current['id']}/end');
        return;
      }
      call = result['call'];
      _registered = true;
      heartbeat();
      await flush();
    } catch (_) {
      if (generation == _generation && !_closed) {
        await release();
        call = null;
        notifyListeners();
        rethrow;
      }
    } finally {
      _busy = false;
    }
  }

  Future<void> accept() async {
    if (_busy || call == null) return;
    _busy = true;
    final generation = ++_generation;
    try {
      final description = await readDescription(
        'offer',
        call!['offer'],
        peer,
        null,
      );
      if (!await makePeer(generation)) return;
      await pc!.setRemoteDescription(
        RTCSessionDescription(description['sdp'], 'offer'),
      );
      if (generation != _generation) return;
      final answer = await pc!.createAnswer();
      if (generation != _generation) return;
      await pc!.setLocalDescription(answer);
      if (generation != _generation) return;
      final current = call!;
      final encrypted = await this.description('answer', answer);
      if (generation != _generation) return;
      final result = await post('/${current['id']}/answer', {
        'answer': encrypted,
      });
      if (generation != _generation) {
        await post('/${current['id']}/end');
        return;
      }
      call = result['call'];
      _registered = true;
      phase = 'З’єднуємо…';
      heartbeat();
      await flush();
      notifyListeners();
    } catch (_) {
      if (generation == _generation && !_closed) {
        await hangup(reason: 'failed');
        rethrow;
      }
    } finally {
      _busy = false;
    }
  }

  void toggleMic() {
    muted = !muted;
    for (final t in stream?.getAudioTracks() ?? <MediaStreamTrack>[]) {
      t.enabled = !muted;
    }
    notifyListeners();
  }

  void toggleCamera() {
    cameraOff = !cameraOff;
    for (final t in stream?.getVideoTracks() ?? <MediaStreamTrack>[]) {
      t.enabled = !cameraOff;
    }
    notifyListeners();
  }

  Future<void> hangup({String reason = 'ended'}) async {
    final id = call?['id'];
    _generation++;
    await release();
    call = null;
    notifyListeners();
    if (id != null) {
      try {
        await post('/$id/end', {'reason': reason});
      } catch (_) {
        /* Server expires missed heartbeats. */
      }
    }
  }

  Future<void> release() async {
    _heartbeat?.cancel();
    _deadline?.cancel();
    _registered = false;
    final connection = pc;
    pc = null;
    if (connection != null) await connection.close();
    final capture = stream;
    stream = null;
    for (final track in capture?.getTracks() ?? <MediaStreamTrack>[]) {
      await track.stop();
    }
    await capture?.dispose();
    local.srcObject = null;
    remote.srcObject = null;
    _candidates.clear();
    _remoteCandidates.clear();
    _seen.clear();
    muted = false;
    cameraOff = false;
  }

  Future<void> shutdown() async {
    _closed = true;
    _poll?.cancel();
    await hangup();
    await local.dispose();
    await remote.dispose();
    super.dispose();
  }
}

class CallScreen extends StatelessWidget {
  final Calls calls;
  const CallScreen(this.calls, {super.key});
  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: calls,
    builder: (context, _) => Scaffold(
      appBar: AppBar(
        title: Text(calls.video ? 'Відеодзвінок' : 'Аудіодзвінок'),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const SizedBox(height: 20),
              Text(
                calls.call == null
                    ? 'Дзвінок завершено'
                    : calls.peer['name'] ?? 'LelekaTalk',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 12),
              Text(calls.call == null ? '' : calls.phase),
              Expanded(
                child: calls.video && calls.stream != null
                    ? Stack(
                        children: [
                          Positioned.fill(child: RTCVideoView(calls.remote)),
                          Positioned(
                            right: 10,
                            top: 20,
                            width: 110,
                            height: 155,
                            child: ClipRRect(
                              borderRadius: BorderRadius.circular(14),
                              child: RTCVideoView(calls.local, mirror: true),
                            ),
                          ),
                        ],
                      )
                    : const Center(child: Icon(Icons.call_outlined, size: 80)),
              ),
              if (calls.call == null)
                FilledButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Закрити'),
                )
              else
                Wrap(
                  alignment: WrapAlignment.center,
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    if (!calls.outgoing && calls.call!['status'] == 'ringing')
                      AsyncAction(
                        onPressed: calls.accept,
                        child: const Text('Прийняти'),
                      ),
                    if (calls.stream != null) ...[
                      IconButton.filledTonal(
                        tooltip: calls.muted
                            ? 'Увімкнути мікрофон'
                            : 'Вимкнути мікрофон',
                        onPressed: calls.toggleMic,
                        icon: Icon(calls.muted ? Icons.mic_off : Icons.mic),
                      ),
                      if (calls.video)
                        IconButton.filledTonal(
                          tooltip: 'Камера',
                          onPressed: calls.toggleCamera,
                          icon: Icon(
                            calls.cameraOff
                                ? Icons.videocam_off
                                : Icons.videocam,
                          ),
                        ),
                    ],
                    FilledButton.icon(
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.red,
                      ),
                      onPressed: () async {
                        await calls.hangup();
                        if (context.mounted) Navigator.pop(context);
                      },
                      icon: const Icon(Icons.call_end),
                      label: const Text('Завершити'),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    ),
  );
}
