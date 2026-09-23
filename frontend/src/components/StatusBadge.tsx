import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

interface StatusBadgeProps {
  status: 'success' | 'warning' | 'error' | 'info' | 'pending';
  text: string;
}

const statusConfig = {
  success: { bg: Colors.successBg, color: Colors.success, icon: '✓' },
  warning: { bg: Colors.warningBg, color: Colors.warning, icon: '⚠' },
  error: { bg: Colors.errorBg, color: Colors.error, icon: '✗' },
  info: { bg: Colors.infoBg, color: Colors.info, icon: 'ℹ' },
  pending: { bg: Colors.warningBg, color: Colors.warning, icon: '⏳' },
};

export default function StatusBadge({ status, text }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.icon, { color: config.color }]}>{config.icon}</Text>
      <Text style={[styles.text, { color: config.color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
    alignSelf: 'flex-start',
  },
  icon: {
    fontSize: 12,
    fontWeight: '700',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
