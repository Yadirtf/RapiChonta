import 'dart:async';

import 'package:flutter/widgets.dart';

/// "4:05": minutos y segundos que faltan (nunca negativo).
String mmss(Duration left) {
  final seconds = left.inSeconds.clamp(0, 99 * 60);
  return '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')}';
}

/// Se reconstruye cada segundo hasta [until] (y una vez más al cumplirse) con lo que falta. Lo usan las cuentas
/// regresivas de E09: la de preparación y la mecha de la pregunta del domiciliario.
class CountdownBuilder extends StatefulWidget {
  const CountdownBuilder({super.key, required this.until, required this.builder});

  final DateTime until;
  final Widget Function(BuildContext context, Duration left) builder;

  @override
  State<CountdownBuilder> createState() => _CountdownBuilderState();
}

class _CountdownBuilderState extends State<CountdownBuilder> {
  Timer? _tick;

  Duration get _left {
    final left = widget.until.difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }

  void _start() {
    _tick?.cancel();
    if (_left == Duration.zero) return;
    _tick = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {});
      if (_left == Duration.zero) timer.cancel();
    });
  }

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(CountdownBuilder old) {
    super.didUpdateWidget(old);
    if (old.until != widget.until) _start();
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _left);
}
