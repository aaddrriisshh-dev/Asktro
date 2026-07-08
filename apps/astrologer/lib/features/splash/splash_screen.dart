import 'package:flutter/material.dart';

import '../../ui/celestial.dart';

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: DecoratedBox(decoration: BoxDecoration(gradient: Sky.heroGrad))),
          const Positioned.fill(child: CelestialWash(opacity: 0.6)),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 108,
                  height: 108,
                  decoration: BoxDecoration(
                    gradient: Sky.goldGrad,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Sky.gold.withValues(alpha: 0.45), blurRadius: 30, offset: const Offset(0, 10))],
                  ),
                  child: const Center(
                    child: Text('A',
                        style: TextStyle(
                            fontFamily: '.SF Pro Display', fontSize: 58, fontWeight: FontWeight.w800, color: Sky.purpleDeep,),),
                  ),
                ),
                const SizedBox(height: 22),
                Text('Asktro Consultation', style: Sky.h1.copyWith(color: Colors.white, fontSize: 24)),
                const SizedBox(height: 6),
                Text('FOR PROFESSIONALS', style: Sky.kicker.copyWith(color: Sky.goldSoft, letterSpacing: 3)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
