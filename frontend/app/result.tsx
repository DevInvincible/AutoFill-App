import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors } from '../src/theme/colors';
import GradientButton from '../src/components/GradientButton';
import StatusBadge from '../src/components/StatusBadge';
import { FillResponse } from '../src/services/api';

export default function ResultScreen() {
  const router = useRouter();
  const { data } = useLocalSearchParams<{ data: string }>();

  const result: FillResponse = useMemo(() => {
    try { return JSON.parse(data || '{}'); } catch { return {}; }
  }, [data]);

  const filled = result.filled || [];
  const statusText =
    result.status === 'ready_to_submit'
      ? 'Ready to Submit'
      : result.status === 'next_page'
      ? 'Next Page Detected'
      : 'Form Filled';

  const statusType =
    result.status === 'ready_to_submit'
      ? 'success'
      : result.status === 'next_page'
      ? 'warning'
      : 'success';

  const successCount = filled.filter(
    (f: any) =>
      f.status === 'filled' ||
      f.status === 'selected' ||
      f.status === 'selected_custom' ||
      f.status === 'checked' ||
      f.status === 'uploaded'
  ).length;

  const failedCount = filled.filter(
    (f: any) =>
      f.status === 'failed' ||
      f.status === 'not_found' ||
      f.status === 'select_failed'
  ).length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'filled': case 'selected': case 'selected_custom': case 'checked': case 'uploaded':
        return 'check';
      case 'failed': case 'not_found': case 'select_failed':
        return 'x';
      case 'skipped': case 'skipped_phone_code':
        return 'skip-forward';
      default:
        return 'minus';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'filled': case 'selected': case 'selected_custom': case 'checked': case 'uploaded':
        return Colors.success;
      case 'failed': case 'not_found': case 'select_failed':
        return Colors.error;
      default:
        return Colors.textMuted;
    }
  };

  const handleNextPage = () => {
    if (result.__interrupt__ || result.form) {
      router.replace({
        pathname: '/review',
        params: {
          data: JSON.stringify({
            success: true,
            thread_id: result.thread_id,
            agent_response: result.__interrupt__ ? undefined : { answers: [], total_questions: 0 },
            __interrupt__: result.__interrupt__,
            form: result.form,
            fill_actions: [],
          }),
        },
      });
    }
  };

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <LinearGradient colors={[Colors.bg, '#080A10', Colors.bg]} style={StyleSheet.absoluteFill} />
        <View style={styles.topGlow} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(100).duration(800)} style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={{ fontSize: 40 }}>
              {result.status === 'ready_to_submit' ? '🎉' : result.status === 'next_page' ? '📄' : '✅'}
            </Text>
          </View>
          <Text style={styles.title}>{statusText}</Text>
          <StatusBadge status={statusType as any} text={statusText} />
        </Animated.View>

        {/* Stats Glass Card */}
        <Animated.View entering={FadeInDown.delay(200).duration(800)}>
          <BlurView intensity={20} tint="dark" style={styles.statsCard}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{result.total_actions || 0}</Text>
              <Text style={styles.statLabel}>TOTAL</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: Colors.success }]}>{successCount}</Text>
              <Text style={styles.statLabel}>FILLED</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: Colors.accentStart }]}>{result.profile_actions || 0}</Text>
              <Text style={styles.statLabel}>PROFILE</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: failedCount > 0 ? Colors.error : Colors.textMuted }]}>{failedCount}</Text>
              <Text style={styles.statLabel}>FAILED</Text>
            </View>
          </BlurView>
        </Animated.View>

        {/* Filled Items */}
        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.section}>
          <Text style={styles.sectionTitle}>EXECUTION LOG</Text>
          {filled.map((item: any, i: number) => (
            <View key={i} style={styles.fillItem}>
              <View style={[styles.iconWrapper, { backgroundColor: getStatusColor(item.status) + '15' }]}>
                <Feather name={getStatusIcon(item.status) as any} size={14} color={getStatusColor(item.status)} />
              </View>
              <View style={styles.fillContent}>
                <Text style={styles.fillLabel} numberOfLines={1}>
                  {item.label || item.semantic_type || 'Unknown Field'}
                </Text>
                <Text style={styles.fillValue} numberOfLines={1}>
                  {typeof item.value === 'string'
                    ? item.value.length > 50 ? item.value.slice(0, 50) + '...' : item.value
                    : String(item.value)}
                </Text>
              </View>
            </View>
          ))}
        </Animated.View>

        {/* Actions */}
        <Animated.View entering={FadeInDown.delay(400).duration(800)} style={styles.buttonSection}>
          {result.status === 'next_page' && (
            <GradientButton title="FILL NEXT PAGE" onPress={handleNextPage} icon={<Feather name="arrow-right" size={18} color="white" />} />
          )}
          {result.status === 'ready_to_submit' && (
            <View style={styles.submitWarning}>
              <Feather name="alert-triangle" size={20} color={Colors.warning} style={{ marginBottom: 10 }} />
              <Text style={styles.submitWarningText}>
                Review the form in your browser before clicking submit manually.
              </Text>
            </View>
          )}
          <View style={{ height: 16 }} />
          <GradientButton title="RETURN TO HOME" onPress={() => router.replace('/')} variant="outline" icon={<Feather name="home" size={18} color={Colors.accentStart} />} />
        </Animated.View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  topGlow: {
    position: 'absolute',
    top: -100,
    left: -50,
    right: -50,
    height: 300,
    backgroundColor: Colors.success,
    opacity: 0.05,
    borderRadius: 200,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 80,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: Colors.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  statsCard: {
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.borderLight,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.textMuted,
    marginTop: 6,
    letterSpacing: 1,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.textMuted,
    marginBottom: 16,
    letterSpacing: 1.5,
  },
  fillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    gap: 12,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fillContent: {
    flex: 1,
  },
  fillLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  fillValue: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  buttonSection: {
    marginTop: 8,
  },
  submitWarning: {
    backgroundColor: 'rgba(255, 215, 0, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    alignItems: 'center',
  },
  submitWarningText: {
    fontSize: 14,
    color: Colors.warning,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
});
