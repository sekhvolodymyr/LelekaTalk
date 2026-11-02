import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:lelekatalk_mobile/calendar.dart';

void main() {
  test(
    'calendar export uses exclusive all-day end, escapes content, and folds UTF8 safely',
    () {
      final text = buildIcs([
        {
          'id': 'test',
          'date': '2026-12-31',
          'time': '',
          'title': '${List.filled(90, 'ї').join()},;\nInjected',
        },
      ], '2026-12-31');
      expect(text, contains('DTSTART;VALUE=DATE:20261231'));
      expect(text, contains('DTEND;VALUE=DATE:20270101'));
      expect(text.replaceAll('\r\n ', ''), contains(r'\,\;\nInjected'));
      for (final line in text.split('\r\n')) {
        expect(utf8.encode(line).length, lessThanOrEqualTo(75));
      }
    },
  );
  test('Google links encode titles and timed events last one hour', () {
    final link = googleEventLink({
      'date': '2026-11-01',
      'time': '12:00',
      'title': 'Подія &action=DELETE',
    });
    expect(link.queryParameters['action'], 'TEMPLATE');
    expect(link.queryParameters['text'], 'Подія &action=DELETE');
    final dates = link.queryParameters['dates']!.split('/');
    expect(dates[0], isNot(dates[1]));
  });
}
