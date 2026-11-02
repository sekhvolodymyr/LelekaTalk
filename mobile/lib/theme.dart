import 'package:flutter/material.dart';

class LelekaPalette {
  final String id, name;
  final Color surface, panel, text, accent;
  final List<Color>? gradient;
  LelekaPalette(
    this.id,
    this.name,
    int surface,
    int panel,
    int text,
    int accent, [
    this.gradient,
  ]) : surface = Color(surface),
       panel = Color(panel),
       text = Color(text),
       accent = Color(accent);
  ThemeData get theme => ThemeData(
    fontFamily: 'Leleka',
    useMaterial3: true,
    brightness: ['dark', 'midnight'].contains(id)
        ? Brightness.dark
        : Brightness.light,
    scaffoldBackgroundColor: surface,
    colorScheme: ColorScheme.fromSeed(
      seedColor: accent,
      brightness: ['dark', 'midnight'].contains(id)
          ? Brightness.dark
          : Brightness.light,
      surface: surface,
      onSurface: text,
      primary: text,
      onPrimary: surface,
      secondaryContainer: panel,
      onSecondaryContainer: text,
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      foregroundColor: text,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    drawerTheme: DrawerThemeData(backgroundColor: panel),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      indicatorColor: panel,
      height: 68,
      labelTextStyle: const WidgetStatePropertyAll(TextStyle(fontSize: 9)),
      iconTheme: const WidgetStatePropertyAll(IconThemeData(size: 20)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: panel,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(16),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(minimumSize: const Size(44, 46)),
    ),
    dividerTheme: DividerThemeData(
      color: text.withValues(alpha: .12),
      thickness: .5,
    ),
  );
  static final all = [
    LelekaPalette(
      'light',
      'Світла',
      0xffffffff,
      0xfff7f7f7,
      0xff252525,
      0xffffd24d,
    ),
    LelekaPalette(
      'dark',
      'Темна',
      0xff212121,
      0xff2b2b2b,
      0xffeeeeee,
      0xffffd24d,
    ),
    LelekaPalette(
      'ocean',
      'Океан',
      0xfff7fbff,
      0xffe5f0fb,
      0xff17324b,
      0xff83c7ff,
    ),
    LelekaPalette(
      'forest',
      'Ліс',
      0xfff7fbf7,
      0xffe8f2e8,
      0xff203d2b,
      0xffacd29b,
    ),
    LelekaPalette(
      'rose',
      'Троянда',
      0xfffffbfc,
      0xfff9e9ef,
      0xff512938,
      0xfff5abc6,
    ),
    LelekaPalette(
      'lavender',
      'Лаванда',
      0xfffcfaff,
      0xfff0eafa,
      0xff3c2c57,
      0xffc8aff1,
    ),
    LelekaPalette(
      'sunrise',
      'Світанок',
      0xfffffcf8,
      0xffffeddf,
      0xff4c302c,
      0xffffc181,
      [Color(0xfffff2cd), Color(0xffffe0d9), Color(0xffeee0fa)],
    ),
    LelekaPalette(
      'aurora',
      'Сяйво',
      0xfff9fffd,
      0xffe3f2ee,
      0xff233e43,
      0xff9dd8c3,
      [Color(0xffd8f5e6), Color(0xffdcf1fa), Color(0xffe9dcfa)],
    ),
    LelekaPalette(
      'sky',
      'Небо',
      0xfffbfdff,
      0xffe9effc,
      0xff293b62,
      0xffa5c6ff,
      [Color(0xffe1eeff), Color(0xffe9e5ff), Color(0xfffce4ef)],
    ),
    LelekaPalette(
      'midnight',
      'Опівніч',
      0xff202939,
      0xff2c3850,
      0xffedf3ff,
      0xffc3b4ff,
      [Color(0xff17283c), Color(0xff28233e), Color(0xff352340)],
    ),
  ];
}
