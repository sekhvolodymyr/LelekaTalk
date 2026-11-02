import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:share_plus/share_plus.dart';
import 'package:uuid/uuid.dart';
import 'package:path_provider/path_provider.dart';

import 'api.dart';
import 'session.dart';
import 'widgets.dart';

class StudioPeer {
  final String id;
  final Json person;
  final RTCPeerConnection pc;
  final Set<String> seen = {};
  final List<Json> pending = [], remote = [];
  bool flushing = false;
  StudioPeer(this.id, this.person, this.pc);
}

class StudioScreen extends StatefulWidget {
  final Session session;
  const StudioScreen(this.session, {super.key});
  @override
  State<StudioScreen> createState() => StudioScreenState();
}

class StudioScreenState extends State<StudioScreen> {
  final deviceId = const Uuid().v4(), renderer = RTCVideoRenderer();
  final title = TextEditingController(), draft = TextEditingController();
  final peers = <String, StudioPeer>{};
  List<Json> streams = [], comments = [];
  Json? room, config;
  String? viewerId, error;
  MediaStream? capture;
  MediaRecorder? recorder;
  String? recordingPath;
  Timer? recordingLimit;
  bool recordWanted = false, recordingReady = false;
  Timer? timer, heartbeat;
  bool busy = false,
      polling = false,
      initialized = false,
      hosting = false,
      muted = false,
      cameraOff = false;
  int generation = 0;
  Session get s => widget.session;
  String get query =>
      'device=$deviceId${viewerId == null ? '' : '&viewerId=$viewerId'}';
  Future<Json> post(String path, [Json body = const {}]) =>
      s.api.post('mvp/studio$path', {'deviceId': deviceId, ...body});
  @override
  void initState() {
    super.initState();
    initialize();
  }

  Future<void> initialize() async {
    await renderer.initialize();
    if (!mounted) return;
    setState(() => initialized = true);
    await poll();
    timer = Timer.periodic(const Duration(seconds: 2), (_) => poll());
  }

  Future<void> signal(StudioPeer peer, String type, Json body) async {
    if (room == null || peers[peer.id] != peer) return;
    final id = const Uuid().v4(), roomId = room!['id'], epoch = generation;
    final encrypted = await s.vault.encrypt(
      {
        'kind': 'studio-signal',
        'id': id,
        'streamId': roomId,
        'viewerId': peer.id,
        'senderId': s.user!['id'],
        'type': type,
        ...body,
      },
      [room!['author'], peer.person],
    );
    if (epoch != generation || peers[peer.id] != peer) return;
    await post('/$roomId/signal', {
      'viewerId': peer.id,
      'id': id,
      'type': type,
      'ciphertext': encrypted,
    });
  }

  Future<void> flush(StudioPeer peer) async {
    if (peer.flushing) return;
    peer.flushing = true;
    try {
      while (peer.pending.isNotEmpty && peers[peer.id] == peer) {
        final batch = peer.pending.take(20).toList();
        peer.pending.removeRange(0, batch.length);
        await signal(peer, 'ice', {'candidates': batch});
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      peer.flushing = false;
    }
  }

  Future<StudioPeer> makePeer(String id, Json person) async {
    final epoch = generation;
    config ??= await s.api.get('mvp/calls/config');
    if (!mounted || epoch != generation)
      throw StateError('operation_cancelled');
    final pc = await createPeerConnection({
      'iceServers': config!['iceServers'],
      'sdpSemantics': 'unified-plan',
    });
    if (!mounted || epoch != generation) {
      await pc.close();
      throw StateError('operation_cancelled');
    }
    final peer = StudioPeer(id, person, pc);
    peers[id] = peer;
    if (hosting) {
      for (final t in capture!.getTracks()) {
        await pc.addTrack(t, capture!);
      }
    }
    pc.onIceCandidate = (candidate) {
      if (peers[id] != peer ||
          candidate.candidate == null ||
          candidate.candidate!.isEmpty)
        return;
      peer.pending.add(candidate.toMap().cast<String, dynamic>());
      flush(peer);
    };
    pc.onTrack = (event) {
      if (!hosting && peers[id] == peer && event.streams.isNotEmpty) {
        renderer.srcObject = event.streams.first;
        if (mounted) setState(() {});
      }
    };
    pc.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed &&
          mounted)
        setState(() => error = 'Відео не підключилося. Спробуйте іншу мережу.');
    };
    return peer;
  }

  Future<void> process(StudioPeer peer, List<Json> signals, int time) async {
    final epoch = generation;
    for (final message in signals) {
      if (message['senderId'] == s.user!['id'] ||
          peer.seen.contains(message['id']))
        continue;
      final sender = hosting ? peer.person : room!['author'];
      final payload = await s.vault.decrypt(message['ciphertext'], sender, {
        'kind': 'studio-signal',
        'id': message['id'],
        'streamId': room!['id'],
        'viewerId': peer.id,
        'senderId': sender['id'],
        'type': message['type'],
      }, time);
      if (epoch != generation || peers[peer.id] != peer) return;
      if (payload['type'] == 'ice') {
        final list = (payload['candidates'] as List).cast<Json>();
        if (list.length > 20) throw StateError('invalid_signal');
        for (final c in list) {
          if ((c['candidate'] as String).length > 4096)
            throw StateError('invalid_signal');
          peer.remote.add(c);
        }
      } else {
        final expected = hosting ? 'answer' : 'offer';
        final Json description = payload['description'];
        if (payload['type'] != expected ||
            description['type'] != expected ||
            description['sdp'] is! String ||
            (description['sdp'] as String).length > 24000 ||
            !RegExp(r'(?:^|\r?\n)m=video ').hasMatch(description['sdp']))
          throw StateError('invalid_signal');
        await peer.pc.setRemoteDescription(
          RTCSessionDescription(description['sdp'], expected),
        );
        if (!hosting) {
          final answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await signal(peer, 'answer', {
            'description': {'type': 'answer', 'sdp': answer.sdp},
          });
        }
      }
      peer.seen.add(message['id']);
    }
    if (await peer.pc.getRemoteDescription() != null) {
      while (peer.remote.isNotEmpty) {
        final c = peer.remote.removeAt(0);
        await peer.pc.addCandidate(
          RTCIceCandidate(c['candidate'], c['sdpMid'], c['sdpMLineIndex']),
        );
      }
    }
  }

  Future<void> poll() async {
    if (polling ||
        busy ||
        !mounted ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.paused)
      return;
    polling = true;
    final epoch = generation;
    try {
      final list = await s.api.get('mvp/studio?device=$deviceId');
      if (!mounted || epoch != generation) return;
      setState(() => streams = (list['streams'] as List).cast<Json>());
      if (room == null) return;
      final result = await s.api.get('mvp/studio/${room!['id']}?$query');
      if (!mounted || epoch != generation) return;
      room = result['stream'];
      comments = (result['comments'] as List).cast<Json>();
      final viewers = (result['viewers'] as List).cast<Json>();
      if (hosting) {
        for (final id in peers.keys.toList()) {
          if (!viewers.any((v) => v['id'] == id)) {
            await peers.remove(id)!.pc.close();
          }
        }
        for (final viewer in viewers) {
          if (epoch != generation) return;
          StudioPeer? peer = peers[viewer['id']];
          if (peer == null) {
            peer = await makePeer(viewer['id'], viewer['person']);
            final offer = await peer.pc.createOffer();
            await peer.pc.setLocalDescription(offer);
            await signal(peer, 'offer', {
              'description': {'type': 'offer', 'sdp': offer.sdp},
            });
          }
          await process(
            peer,
            (viewer['signals'] as List).cast<Json>(),
            result['serverTime'],
          );
        }
      } else {
        final viewer = viewers.where((v) => v['id'] == viewerId).firstOrNull;
        if (viewer == null) {
          await leave();
          return;
        }
        final peer =
            peers[viewerId] ?? await makePeer(viewerId!, room!['author']);
        await process(
          peer,
          (viewer['signals'] as List).cast<Json>(),
          result['serverTime'],
        );
      }
      if (mounted) setState(() => error = null);
    } catch (e) {
      if (epoch == generation && mounted) {
        if (e is ApiException &&
            [401, 403, 404].contains(e.status) &&
            room != null)
          await leave();
        if (mounted) setState(() => error = e.toString());
      }
    } finally {
      polling = false;
    }
  }

  void beginHeartbeat() {
    heartbeat?.cancel();
    heartbeat = Timer.periodic(const Duration(seconds: 15), (_) async {
      if (room == null) return;
      try {
        await post('/${room!['id']}/heartbeat', {'viewerId': viewerId});
      } catch (e) {
        if (mounted) setState(() => error = e.toString());
      }
    });
  }

  Future<void> start() async {
    if (!s.vault.unlocked) throw StateError('keys_locked');
    if (title.text.trim().isEmpty) throw StateError('Вкажіть тему ефіру.');
    busy = true;
    final epoch = ++generation;
    try {
      final captured = await navigator.mediaDevices.getUserMedia({
        'audio': true,
        'video': {'facingMode': 'user', 'width': 640, 'height': 960},
      });
      if (!mounted || epoch != generation) {
        for (final track in captured.getTracks()) {
          await track.stop();
        }
        await captured.dispose();
        return;
      }
      capture = captured;
      final result = await post('', {
        'id': const Uuid().v4(),
        'title': title.text.trim(),
      });
      if (!mounted || epoch != generation) {
        try {
          await post('/${result['stream']['id']}/end');
        } catch (_) {}
        return;
      }
      room = result['stream'];
      hosting = true;
      renderer.srcObject = capture;
      if (recordWanted) {
        try {
          recordingPath =
              '${(await getTemporaryDirectory()).path}/leleka-live-${room!['id']}.mp4';
          recorder = MediaRecorder();
          await recorder!.start(
            recordingPath!,
            videoTrack: capture!.getVideoTracks().first,
            audioChannel: RecorderAudioChannel.INPUT,
          );
          recordingLimit = Timer.periodic(const Duration(seconds: 1), (
            _,
          ) async {
            final path = recordingPath;
            if (path != null &&
                await File(path).exists() &&
                await File(path).length() >= 128 * 1024 * 1024) {
              await stopRecording();
              if (mounted)
                setState(
                  () => error =
                      'Запис досяг 128 МБ і зупинений. Ефір продовжується.',
                );
            }
          });
        } catch (_) {
          recorder = null;
          if (mounted)
            setState(
              () => error = 'Не вдалося почати запис. Ефір триває без запису.',
            );
        }
      }
      beginHeartbeat();
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted && epoch == generation) {
        await cleanup();
        rethrow;
      }
    } finally {
      busy = false;
    }
  }

  Future<void> watch(Json value) async {
    if (busy) return;
    if (!s.vault.unlocked) throw StateError('keys_locked');
    if (hosting) throw StateError('Спочатку завершіть свій ефір.');
    await leave();
    busy = true;
    final epoch = ++generation;
    try {
      viewerId = const Uuid().v4();
      final joining = viewerId;
      final result = await post('/${value['id']}/join', {'viewerId': viewerId});
      if (!mounted || epoch != generation) {
        try {
          await post('/${value['id']}/leave', {'viewerId': joining});
        } catch (_) {}
        return;
      }
      room = result['stream'];
      hosting = false;
      beginHeartbeat();
      if (mounted) setState(() {});
    } catch (_) {
      if (mounted && epoch == generation) {
        await cleanup();
        rethrow;
      }
    } finally {
      busy = false;
    }
  }

  Future<void> cleanup() async {
    generation++;
    await stopRecording();
    heartbeat?.cancel();
    for (final p in peers.values.toList()) {
      await p.pc.close();
    }
    peers.clear();
    for (final t in capture?.getTracks() ?? <MediaStreamTrack>[]) {
      await t.stop();
    }
    await capture?.dispose();
    capture = null;
    renderer.srcObject = null;
    room = null;
    viewerId = null;
    hosting = false;
    comments = [];
    muted = false;
    cameraOff = false;
  }

  Future<void> stopRecording() async {
    recordingLimit?.cancel();
    final active = recorder;
    recorder = null;
    if (active != null) {
      try {
        await active.stop();
        recordingReady = true;
      } catch (_) {
        recordingReady = false;
      }
    }
  }

  Future<void> discardRecording() async {
    await stopRecording();
    final path = recordingPath;
    recordingPath = null;
    recordingReady = false;
    if (path != null && await File(path).exists()) await File(path).delete();
    if (mounted) setState(() {});
  }

  Future<void> leave() async {
    final current = room, id = viewerId, host = hosting;
    await cleanup();
    if (current != null) {
      try {
        await post('/${current['id']}/${host ? 'end' : 'leave'}', {
          'viewerId': id,
        });
      } catch (_) {}
    }
    if (mounted) setState(() {});
  }

  Future<void> work(Future<void> Function() action) async {
    try {
      await action();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<bool> beforeLeave() async {
    if (busy) return false;
    if (hosting || recorder != null || recordingReady) {
      if (!await confirm(
        context,
        recordWanted || recordingReady
            ? 'Завершити ефір і видалити локальний запис? Експортуй відео перед виходом, якщо хочеш зберегти його.'
            : 'Завершити поточний ефір?',
      ))
        return false;
    }
    await leave();
    await discardRecording();
    return true;
  }

  @override
  void dispose() {
    timer?.cancel();
    heartbeat?.cancel();
    recordingLimit?.cancel();
    leave().whenComplete(() async {
      await discardRecording();
      await renderer.dispose();
    });
    title.dispose();
    draft.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: room == null,
    onPopInvokedWithResult: (didPop, _) async {
      if (!didPop && await confirm(context, 'Завершити перегляд або ефір?'))
        await leave();
    },
    child: ListView(
      padding: const EdgeInsets.all(18),
      children: [
        Text(
          'Твій момент. Твоя розмова. Наживо.',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 16),
        if (error != null)
          ListTile(
            title: Text(error!),
            trailing: IconButton(
              onPressed: poll,
              icon: const Icon(Icons.refresh),
            ),
          ),
        if (room == null) ...[
          TextField(
            controller: title,
            maxLength: 80,
            decoration: const InputDecoration(hintText: 'Про що твій ефір?'),
          ),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Підготувати локальний запис'),
            subtitle: const Text(
              'Лише на пристрої, до 128 МБ. Експортуй файл перед виходом зі студії.',
            ),
            value: recordWanted,
            onChanged: (v) => setState(() => recordWanted = v!),
          ),
          AsyncAction(
            onPressed: () async {
              if (recordingReady &&
                  !await confirm(
                    context,
                    'Видалити попередній локальний запис?',
                  ))
                return;
              await discardRecording();
              await start();
            },
            child: const Text('● Почати ефір'),
          ),
          const SizedBox(height: 12),
          const Text(
            'Ефіри відкриті користувачам LelekaTalk. До 5 глядачів. Відео не зберігається на сервері. Тримайте застосунок відкритим.',
            style: TextStyle(fontSize: 12, color: Colors.grey),
          ),
        ] else ...[
          GestureDetector(
            onVerticalDragEnd: (details) {
              if (hosting || streams.length < 2) return;
              final index = streams.indexWhere((r) => r['id'] == room!['id']);
              final direction = (details.primaryVelocity ?? 0) < 0 ? 1 : -1;
              work(
                () => watch(
                  streams[(index + direction + streams.length) %
                      streams.length],
                ),
              );
            },
            child: ClipRRect(
              borderRadius: BorderRadius.circular(20),
              child: AspectRatio(
                aspectRatio: 9 / 15,
                child: Stack(
                  children: [
                    const Positioned.fill(
                      child: ColoredBox(color: Colors.black),
                    ),
                    if (initialized)
                      Positioned.fill(
                        child: RTCVideoView(
                          renderer,
                          mirror: hosting,
                          objectFit:
                              RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                        ),
                      ),
                    Positioned(
                      top: 16,
                      left: 16,
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '● НАЖИВО · ${room!['viewerCount']}/5',
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    ),
                    Positioned(
                      bottom: 16,
                      left: 16,
                      right: 16,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            room!['author']['name'],
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            room!['title'],
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 20,
                            ),
                          ),
                          for (final c
                              in comments.reversed.take(4).toList().reversed)
                            Text(
                              '${c['authorName']}: ${c['text']}',
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              TextButton.icon(
                onPressed: () => work(() async {
                  room = (await post('/${room!['id']}/like', {
                    'viewerId': viewerId,
                    'liked': room!['liked'] != true,
                  }))['stream'];
                  if (mounted) setState(() {});
                }),
                icon: Icon(
                  room!['liked'] == true
                      ? Icons.favorite
                      : Icons.favorite_border,
                ),
                label: Text('${room!['likes']}'),
              ),
              IconButton(
                tooltip: 'Поширити ефір',
                icon: const Icon(Icons.ios_share),
                onPressed: () => work(() async {
                  final id = room!['id'];
                  await post('/$id/share', {'viewerId': viewerId});
                  await SharePlus.instance.share(
                    ShareParams(
                      text: 'https://lelekatalk.vercel.app/?live=$id',
                    ),
                  );
                }),
              ),
              if (hosting) ...[
                IconButton(
                  tooltip: 'Мікрофон',
                  icon: Icon(muted ? Icons.mic_off : Icons.mic),
                  onPressed: () {
                    setState(() => muted = !muted);
                    for (final t in capture!.getAudioTracks()) {
                      t.enabled = !muted;
                    }
                  },
                ),
                IconButton(
                  tooltip: 'Камера',
                  icon: Icon(cameraOff ? Icons.videocam_off : Icons.videocam),
                  onPressed: () {
                    setState(() => cameraOff = !cameraOff);
                    for (final t in capture!.getVideoTracks()) {
                      t.enabled = !cameraOff;
                    }
                  },
                ),
              ],
              TextButton(
                onPressed: () => work(leave),
                child: Text(hosting ? 'Завершити ефір' : 'Залишити ефір'),
              ),
            ],
          ),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: draft,
                  maxLength: 300,
                  decoration: const InputDecoration(
                    hintText: 'Коментар…',
                    counterText: '',
                  ),
                ),
              ),
              AsyncAction(
                onPressed: () async {
                  final submitted = draft.text;
                  await post('/${room!['id']}/comment', {
                    'viewerId': viewerId,
                    'id': const Uuid().v4(),
                    'text': submitted.trim(),
                  });
                  if (draft.text == submitted) draft.clear();
                  await poll();
                },
                child: const Icon(Icons.arrow_upward),
              ),
            ],
          ),
        ],
        if (recordingReady && recordingPath != null) ...[
          const SizedBox(height: 16),
          const Text('Локальний запис готовий'),
          Wrap(
            spacing: 8,
            children: [
              TextButton.icon(
                icon: const Icon(Icons.download),
                label: const Text('Експортувати відео'),
                onPressed: () => work(() async {
                  await SharePlus.instance.share(
                    ShareParams(
                      files: [XFile(recordingPath!, mimeType: 'video/mp4')],
                      text: 'LelekaTalk Live',
                    ),
                  );
                }),
              ),
              TextButton(
                onPressed: () => work(() async {
                  if (await confirm(context, 'Видалити локальний запис?'))
                    await discardRecording();
                }),
                child: const Text('Видалити запис'),
              ),
            ],
          ),
        ],
        const SizedBox(height: 24),
        for (final stream in streams)
          ListTile(
            leading: const Icon(Icons.live_tv, color: Colors.red),
            title: Text(stream['title']),
            subtitle: Text(
              '${stream['author']['name']} · ${stream['viewerCount']} глядачів',
            ),
            onTap: () => work(() => watch(stream)),
          ),
        if (streams.isEmpty && room == null)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Text(
              'Зараз ефірів немає. Почни щось справжнє.',
              textAlign: TextAlign.center,
            ),
          ),
      ],
    ),
  );
}
