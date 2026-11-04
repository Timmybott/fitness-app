import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { AppText } from '@/components/app-text';
import { Colors, Spacing } from '@/constants/theme';

/** Minimal line chart: values are plotted evenly spaced, with the last point highlighted. */
export function LineChart({ values, color, height = 120 }: { values: number[]; color: string; height?: number }) {
  const [width, setWidth] = useState(0);
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.15 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * (width - 8) + 4);
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          <Circle cx={x(last)} cy={y(values[last])} r={4.5} fill={color} />
        </Svg>
      )}
    </View>
  );
}

/** Bar chart with labels below and an optional dashed goal line. */
export function BarChart({ bars, goal, color, height = 110 }: { bars: { label: string; value: number }[]; goal?: number; color: string; height?: number }) {
  const [width, setWidth] = useState(0);
  const max = Math.max(goal ?? 0, ...bars.map((b) => b.value), 1) * 1.1;
  const slot = width / Math.max(1, bars.length);
  const barW = Math.min(28, slot * 0.6);

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {bars.map((b, i) => {
              const h = (b.value / max) * height;
              return (
                <Rect
                  key={i}
                  x={i * slot + (slot - barW) / 2}
                  y={height - h}
                  width={barW}
                  height={Math.max(h, b.value > 0 ? 3 : 0)}
                  rx={5}
                  fill={goal && b.value > goal ? Colors.danger : color}
                />
              );
            })}
            {goal ? (
              <Line x1={0} x2={width} y1={height - (goal / max) * height} y2={height - (goal / max) * height} stroke={Colors.textTertiary} strokeDasharray="4 4" />
            ) : null}
          </Svg>
        )}
      </View>
      <View style={styles.labels}>
        {bars.map((b, i) => (
          <AppText key={i} type="caption" color={Colors.textSecondary} style={styles.label}>
            {b.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  labels: { flexDirection: 'row', marginTop: Spacing.one },
  label: { flex: 1, textAlign: 'center', fontSize: 11 },
});
