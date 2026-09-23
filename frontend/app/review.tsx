import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather, FontAwesome5 } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Animated, { FadeIn, FadeInDown, SlideInRight, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import QuestionCard from '../src/components/QuestionCard';
import StatusBadge from '../src/components/StatusBadge';
import { ApplyResponse, AgentAnswer, submitAnswers, fillForm } from '../src/services/api';

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useLocalSearchParams<{ data: string }>();

  const applyResult: ApplyResponse = useMemo(() => {
    try { return JSON.parse(data || '{}'); } catch { return {}; }
  }, [data]);

  const answers = applyResult.agent_response?.answers || [];
  const threadId = applyResult.thread_id || '';
  const jobContext = applyResult.job_context || {};

  const autoAnswered = answers.filter((a) => !a.needs_user_input);
  const needsInput = answers.filter((a) => a.needs_user_input);

  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const updateAnswer = (question: AgentAnswer, value: string) => {
    const key = question.id || question.name || question.question;
    setUserAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleFill = async () => {
    Alert.alert(
      'Submission Started',
      'The final steps are running in the background. You can leave the app, and we will notify you when completed.',
      [{ text: 'OK' }]
    );
    setLoading(true);

    (async () => {
      try {
        if (needsInput.length > 0) {
          await submitAnswers(threadId, userAnswers);
        }
        const result = await fillForm(threadId);
        setLoading(false);
        
        if (!result.success) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Submission Failed',
              body: result.error || result.message || 'An error occurred during submission.',
            },
            trigger: null,
          });
          return;
        }
        if (result.status === 'next_page') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'More Info Needed',
              body: 'The application has another page that requires review.',
              data: { route: '/review', params: { data: JSON.stringify(result) } },
            },
            trigger: null,
          });
          // Also update active jobs
          try {
            const stored = await AsyncStorage.getItem('@active_jobs');
            if (stored) {
              let jobs = JSON.parse(stored);
              jobs = jobs.filter((j: any) => j.thread_id !== threadId);
              if (result.thread_id) {
                jobs.push({
                  thread_id: result.thread_id,
                  url: applyResult.url || '',
                  title: applyResult.title || 'Job Application',
                  status: 'Needs Review',
                  timestamp: Date.now(),
                  data: JSON.stringify(result)
                });
              }
              await AsyncStorage.setItem('@active_jobs', JSON.stringify(jobs));
            }
          } catch {}
          return;
        }

        // Cleanup active jobs on complete
        try {
          const stored = await AsyncStorage.getItem('@active_jobs');
          if (stored) {
            const jobs = JSON.parse(stored).filter((j: any) => j.thread_id !== threadId);
            await AsyncStorage.setItem('@active_jobs', JSON.stringify(jobs));
          }
        } catch {}

        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Application Completed',
            body: 'Your job application has been successfully submitted.',
            data: { route: '/result', params: { data: JSON.stringify(result) } },
          },
          trigger: null,
        });
      } catch (error: any) {
        setLoading(false);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Network Error',
            body: error.message || 'An error occurred while connecting to the service.',
          },
          trigger: null,
        });
      }
    })();
  };

  const allQuestionsAnswered =
    needsInput.length === 0 ||
    needsInput.every((q) => {
      const key = q.id || q.name || q.question;
      return userAnswers[key] && userAnswers[key].trim().length > 0;
    });

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 40) }]}
      >
        
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(500).springify()} style={styles.header}>
          <Text style={styles.title}>Review Application</Text>
          <Text style={styles.subtitle}>Final check before submitting</Text>
        </Animated.View>

        {/* Job Context */}
        {jobContext.job_title && (
          <Animated.View entering={FadeInDown.duration(500).delay(100).springify()} style={styles.contextCard}>
            <View style={styles.contextIconWrapper}>
              <Feather name="briefcase" size={20} color="#007AFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.jobTitle} numberOfLines={1}>{jobContext.job_title}</Text>
              {jobContext.page_title && (
                <Text style={styles.jobCompany} numberOfLines={1}>{jobContext.page_title}</Text>
              )}
            </View>
          </Animated.View>
        )}

        {/* Stats */}
        <Animated.View entering={FadeInDown.duration(500).delay(200).springify()} style={styles.statsRow}>
          <StatusBadge status="success" text={`${autoAnswered.length} Auto-filled`} />
          {needsInput.length > 0 && (
            <StatusBadge status="warning" text={`${needsInput.length} Action Needed`} />
          )}
        </Animated.View>

        {/* Needs Input Section */}
        {needsInput.length > 0 && (
          <Animated.View entering={FadeIn.duration(600).delay(300)} layout={Layout.springify()} style={styles.section}>
            <Text style={styles.sectionTitle}>Requires Your Attention</Text>
            {needsInput.map((q, i) => (
              <Animated.View key={`user-${i}`} entering={SlideInRight.delay(300 + i * 100).springify()}>
                <QuestionCard
                  question={q}
                  userAnswer={userAnswers[q.id || q.name || q.question] || ''}
                  onAnswerChange={(v) => updateAnswer(q, v)}
                />
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* Auto Answered Section */}
        {autoAnswered.length > 0 && (
          <Animated.View entering={FadeIn.duration(600).delay(400)} layout={Layout.springify()} style={styles.section}>
            <Text style={styles.sectionTitle}>AI Handled</Text>
            {autoAnswered.map((q, i) => (
              <Animated.View key={`auto-${i}`} entering={FadeIn.delay(400 + i * 50)}>
                <QuestionCard question={q} userAnswer="" onAnswerChange={() => {}} />
              </Animated.View>
            ))}
          </Animated.View>
        )}

        {/* Submit Action */}
        <Animated.View entering={FadeInDown.duration(600).delay(500).springify()} style={styles.bottomSection}>
          <TouchableOpacity 
            style={[styles.primaryButton, (!allQuestionsAnswered || loading) && styles.primaryButtonDisabled]} 
            onPress={handleFill}
            disabled={!allQuestionsAnswered || loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {needsInput.length > 0 ? 'Save & Submit' : 'Confirm & Submit'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        <View style={{ height: Math.max(insets.bottom, 40) }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 32,
    marginTop: 10,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 6,
  },
  contextCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#222222',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  contextIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  jobCompany: {
    fontSize: 14,
    color: '#8E8E93',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8E8E93',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bottomSection: {
    marginTop: 10,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryButtonDisabled: {
    backgroundColor: '#333333',
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
