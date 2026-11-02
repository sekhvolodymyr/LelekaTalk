import 'dart:convert';

import 'api.dart';

String dayString(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
String _stamp(DateTime date) =>
    '${dayString(date).replaceAll('-', '')}T${date.hour.toString().padLeft(2, '0')}${date.minute.toString().padLeft(2, '0')}${date.second.toString().padLeft(2, '0')}Z';
String icsEscape(String value) => value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r', '')
    .replaceAll('\n', r'\n')
    .replaceAll(';', r'\;')
    .replaceAll(',', r'\,');
({String start, String end, bool allDay}) eventDates(Json plan) {
  final date = DateTime.parse(plan['date']);
  final String time = plan['time'] ?? '';
  if (time.isEmpty)
    return (
      start: dayString(date).replaceAll('-', ''),
      end: dayString(
        DateTime(date.year, date.month, date.day + 1),
      ).replaceAll('-', ''),
      allDay: true,
    );
  final parts = time.split(':');
  final start = DateTime(
    date.year,
    date.month,
    date.day,
    int.parse(parts[0]),
    int.parse(parts[1]),
  );
  if (start.hour != int.parse(parts[0]) || start.minute != int.parse(parts[1]))
    throw ArgumentError('invalid_time');
  return (
    start: _stamp(start.toUtc()),
    end: _stamp(start.add(const Duration(hours: 1)).toUtc()),
    allDay: false,
  );
}

Uri googleEventLink(Json plan) {
  final dates = eventDates(plan);
  return Uri.https('calendar.google.com', '/calendar/render', {
    'action': 'TEMPLATE',
    'text': plan['title'],
    'dates': '${dates.start}/${dates.end}',
  });
}

String buildIcs(List<Json> plans, String day) {
  final lines = <String>[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LelekaTalk//Mobile//UK',
    'CALSCALE:GREGORIAN',
  ];
  for (final p in plans) {
    final dates = eventDates(p);
    lines.addAll([
      'BEGIN:VEVENT',
      'UID:${icsEscape(p['id'])}@lelekatalk',
      'DTSTAMP:${_stamp(DateTime.now().toUtc())}',
      'SUMMARY:${icsEscape(p['title'])}',
      'DTSTART${dates.allDay ? ';VALUE=DATE' : ''}:${dates.start}',
      'DTEND${dates.allDay ? ';VALUE=DATE' : ''}:${dates.end}',
      'END:VEVENT',
    ]);
  }
  lines.add('END:VCALENDAR');
  String fold(String line) {
    final result = StringBuffer();
    var bytes = 0;
    for (final rune in line.runes) {
      final char = String.fromCharCode(rune), length = utf8.encode(char).length;
      if (bytes + length > 75) {
        result.write('\r\n ');
        bytes = 1;
      }
      result.write(char);
      bytes += length;
    }
    return result.toString();
  }

  return '${lines.map(fold).join('\r\n')}\r\n';
}
