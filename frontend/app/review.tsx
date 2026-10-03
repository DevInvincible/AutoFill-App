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
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Animated, { FadeIn, FadeInDown, SlideInRight, Layout } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

import QuestionCard from '../src/components/QuestionCard';
import StatusBadge from '../src/components/StatusBadge';
import { ApplyResponse, AgentAnswer, submitAnswers, fillForm } from '../src/services/api';
import { supabase } from '../src/lib/supabase';

const ACTIVE_JOBS_KEY = '@active_jobs';

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data } = useLocalSearchParams<{ data: string }>();

  const applyResult: ApplyResponse = useMemo(() => {
    try { return JSON.parse(data || '{}'); } catch { return {}; }
  }, [data]);

  const answers = applyResult.agent_response?.answers || [];
  const profileActions = applyResult.fill_actions || [];
  const threadId = applyResult.thread_id || '';
  const jobContext = applyResult.job_context || {};

  const autoAnswered = [
    ...profileActions.map((action: any) => ({
      id: action.id,
      name: action.name,
      question: action.label || action.semantic_type,
      field_type: action.field_type,
      answer: action.value,
      needs_user_input: false,
      answer_source: 'Your Profile',
      options: [],
      confidence: 1.0
    })),
    ...answers.filter((a: any) => !a.needs_user_input)
  ];
  const needsInput = answers.filter((a: any) => a.needs_user_input);

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
          const errMsg = result.error || result.message || 'An error occurred during submission.';
          Alert.alert('Submission Failed', errMsg);
          await Notifications.scheduleNotificationAsync({
            content: { title: '❌ Submission Failed', body: errMsg },
            trigger: null,
          });
          return;
        }

        if (result.status === 'next_page') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: '📄 Next Page',
              body: 'The application has another page that requires review.',
              data: { route: '/review', params: { data: JSON.stringify(result) } },
            },
            trigger: null,
          });
          try {
            const stored = await AsyncStorage.getItem(ACTIVE_JOBS_KEY);
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
                  data: JSON.stringify(result),
                });
              }
              await AsyncStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(jobs));
            }
          } catch {}
          router.replace({ pathname: '/review', params: { data: JSON.stringify(result) } });
          return;
        }

        // Cleanup active jobs on completion
        try {
          const stored = await AsyncStorage.getItem(ACTIVE_JOBS_KEY);
          if (stored) {
            const jobs = JSON.parse(stored).filter((j: any) => j.thread_id !== threadId);
            await AsyncStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(jobs));
          }
        } catch {}

        await Notifications.scheduleNotificationAsync({
          content: {
            title: '🎉 Application Submitted!',
            body: 'Your job application has been successfully submitted.',
            data: { route: '/result', params: { data: JSON.stringify(result) } },
          },
          trigger: null,
        });

        // Save to Supabase History
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user?.id) {
            await supabase.from('job_applications').insert({
              user_id: session.user.id,
              company_name: jobContext?.page_title || 'Unknown Company',
              job_title: jobContext?.job_title || applyResult.title || 'Job Application',
              job_url: applyResult.url || '',
              status: 'success'
            });
          }
        } catch (err) {
          console.error("History save error:", err);
        }

        // Navigate directly to the result screen
        router.replace({ pathname: '/result', params: { data: JSON.stringify(result) } });
      } catch (error: any) {
        setLoading(false);
        const msg = error.friendlyMessage || error.message || 'An error occurred while connecting to the service.';
        Alert.alert('Network Error', msg);
        await Notifications.scheduleNotificationAsync({
          content: { title: '❌ Network Error', body: msg },
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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
             <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
             <Text style={styles.title}>Step 2 of 3 · Review</Text>
             <View style={styles.progressTrack}>
                <View style={styles.progressFill} />
             </View>
          </View>
        </Animated.View>

        {/* Job Context */}
        {jobContext.job_title && (
          <Animated.View entering={FadeInDown.duration(500).delay(100).springify()} style={styles.contextCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={styles.companyLogoBox}>
                <Text style={{ color: '#4facfe', fontSize: 20, fontWeight: '700' }}>
                   {jobContext.page_title ? jobContext.page_title.charAt(0) : 'J'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.jobCompany} numberOfLines={1}>{jobContext.page_title}</Text>
                <Text style={styles.jobTitle} numberOfLines={2}>{jobContext.job_title}</Text>
              </View>
            </View>
            <View style={styles.tagsRow}>
               <View style={styles.tag}>
                  <Ionicons name="location-outline" size={12} color="#ccc" />
                  <Text style={styles.tagText}>San Francisco, CA</Text>
               </View>
               <View style={styles.tag}>
                  <Ionicons name="cloud-outline" size={12} color="#ccc" />
                  <Text style={styles.tagText}>Remote</Text>
               </View>
               <View style={styles.tag}>
                  <Ionicons name="flame" size={12} color="#FFA726" />
                  <Text style={[styles.tagText, styles.matchScore]}>78% Match</Text>
               </View>
            </View>
          </Animated.View>
        )}

        {/* Stats */}
        <Animated.View entering={FadeInDown.duration(500).delay(200).springify()} style={styles.statsCard}>
           <View style={styles.ringBox} />
           <View style={styles.statsTextCol}>
              <Text style={styles.statsMainText}>{autoAnswered.length} of {autoAnswered.length + needsInput.length} fields ready</Text>
              {needsInput.length > 0 && (
                 <Text style={styles.statsSubText}>
                    <Ionicons name="warning-outline" size={12} /> {needsInput.length} need your answer
                 </Text>
              )}
           </View>
        </Animated.View>

        {/* Needs Input Section */}
        {needsInput.length > 0 && (
          <Animated.View entering={FadeIn.duration(600).delay(300)} layout={Layout.springify()} style={styles.section}>
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
            {autoAnswered.map((q, i) => (
              <Animated.View key={`auto-${i}`} entering={FadeIn.delay(400 + i * 50)}>
                <QuestionCard question={q} userAnswer="" onAnswerChange={() => {}} />
              </Animated.View>
            ))}
          </Animated.View>
        )}

        <View style={{ height: Math.max(insets.bottom, 100) }} />
      </ScrollView>
      
      {/* Pinned Bottom Button */}
      <View style={[styles.pinnedBottom, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity 
          onPress={handleFill}
          disabled={!allQuestionsAnswered || loading}
          activeOpacity={0.8}
          style={{ width: '100%' }}
        >
          <LinearGradient
            colors={allQuestionsAnswered ? ['#4facfe', '#00f2fe'] : ['#333333', '#222222']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBtn}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={[styles.gradientBtnText, !allQuestionsAnswered && { color: '#666' }]}>
                {allQuestionsAnswered ? 'Submit application' : `Answer ${needsInput.filter(q => {
                   const k = q.id || q.name || q.question;
                   return !(userAnswers[k] && userAnswers[k].trim().length > 0);
                }).length} more fields`}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
    marginLeft: -8,
  },
  headerCenter: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'sans-serif',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 8,
    width: '100%',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4facfe',
    borderRadius: 2,
    width: '66%',
  },
  contextCard: {
    backgroundColor: '#1A1D24',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  companyLogoBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(79, 172, 254, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    marginRight: 16,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    fontFamily: 'sans-serif',
    lineHeight: 24,
  },
  jobCompany: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
    fontFamily: 'sans-serif',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  tagText: {
    fontSize: 11,
    color: '#ccc',
    fontWeight: '500',
  },
  matchScore: {
    color: '#FFA726',
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1D24',
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  ringBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#4facfe',
    marginRight: 16,
    borderRightColor: '#FFA726',
    transform: [{ rotate: '-45deg' }],
  },
  statsTextCol: {
    flex: 1,
  },
  statsMainText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statsSubText: {
    color: '#FFA726',
    fontSize: 13,
    fontWeight: '500',
  },
  section: {
    marginBottom: 16,
  },
  pinnedBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 17, 23, 0.9)',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  gradientBtn: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  }
});
