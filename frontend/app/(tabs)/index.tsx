import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Clipboard,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import Animated, { FadeInUp, FadeInDown, StretchInY } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { applyToJob, UserProfile } from '../../src/services/api';

const PROFILE_KEY = '@user_profile';
const ACTIVE_JOBS_KEY = '@active_jobs';

interface ActiveJob {
  thread_id: string;
  url: string;
  title: string;
  status: string;
  timestamp: number;
  data?: string;
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ resumeUrl?: string }>();
  
  const [url, setUrl] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [isUrlFocused, setIsUrlFocused] = useState(false);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);

  useEffect(() => {
    if (params.resumeUrl && profile && !loading) {
      setUrl(params.resumeUrl);
      router.setParams({ resumeUrl: '' }); // Clear it to prevent looping
      handleApply(params.resumeUrl);
    }
  }, [params.resumeUrl, profile]);

  useFocusEffect(
    useCallback(() => {
      AsyncStorage.getItem(PROFILE_KEY).then((data) => {
        if (data) {
          try {
            setProfile(JSON.parse(data));
          } catch {}
        }
      });
      AsyncStorage.getItem(ACTIVE_JOBS_KEY).then((data) => {
        if (data) {
          try {
            const jobs = JSON.parse(data);
            // Sort by most recent
            jobs.sort((a: any, b: any) => b.timestamp - a.timestamp);
            setActiveJobs(jobs);
          } catch {}
        }
      });
    }, [])
  );

  const saveActiveJob = async (job: ActiveJob) => {
    try {
      const stored = await AsyncStorage.getItem(ACTIVE_JOBS_KEY);
      let jobs: ActiveJob[] = stored ? JSON.parse(stored) : [];
      // Remove if exists
      jobs = jobs.filter(j => j.thread_id !== job.thread_id);
      jobs.push(job);
      await AsyncStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(jobs));
      setActiveJobs(jobs.sort((a, b) => b.timestamp - a.timestamp));
    } catch {}
  };

  const removeActiveJob = async (thread_id: string) => {
    try {
      const stored = await AsyncStorage.getItem(ACTIVE_JOBS_KEY);
      let jobs: ActiveJob[] = stored ? JSON.parse(stored) : [];
      jobs = jobs.filter(j => j.thread_id !== thread_id);
      await AsyncStorage.setItem(ACTIVE_JOBS_KEY, JSON.stringify(jobs));
      setActiveJobs(jobs);
    } catch {}
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      if (text) setUrl(text);
    } catch {}
  };

  const requestPermissions = async () => {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    return finalStatus === 'granted';
  };

  const handleApply = async (overrideUrl?: string | any) => {
    // If called from onPress, overrideUrl is a GestureResponderEvent object
    const jobUrl = typeof overrideUrl === 'string' ? overrideUrl : url;
    
    if (!jobUrl.trim()) {
      Alert.alert('Missing URL', 'Please paste a valid job application URL.');
      return;
    }
    if (!profile) {
      Alert.alert('Missing Profile', 'Please complete your candidate profile first.');
      router.push('/profile');
      return;
    }
    
    await requestPermissions();

    Alert.alert(
      'Process Started', 
      'We are analyzing and filling your application in the background. You can leave the app; we will notify you when it finishes or needs your input.',
      [{ text: 'OK' }]
    );

    setLoading(true);
    
    const cookieData = await AsyncStorage.getItem('universal_cookies');
    const allCookies = cookieData ? JSON.parse(cookieData) : {};
    
    // Find cookies for the target job's domain
    let cookies;
    try {
      const urlObj = new URL(jobUrl.trim());
      const domainKey = urlObj.hostname.replace('www.', '');
      cookies = allCookies[domainKey] || allCookies['www.' + domainKey] || allCookies[urlObj.hostname];
    } catch (e) {
      cookies = undefined;
    }
    
    applyToJob(jobUrl.trim(), profile, cookies).then(async (result) => {
      setLoading(false);
      setUrl('');
      
      if (result.requires_login) {
        Alert.alert('Login Required', 'Please log in to the job portal to continue the application process.', [
          { text: 'Log In', onPress: () => router.push({ pathname: '/login', params: { url: result.login_url || jobUrl, resumeUrl: jobUrl } }) }
        ]);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Authentication Required',
            body: 'Please log in to the job portal to continue the application process.',
            data: { route: '/login', params: { url: result.login_url || jobUrl, resumeUrl: jobUrl } },
          },
          trigger: null,
        });
        return;
      }
      
      if (!result.success) {
        Alert.alert('Application Failed', result.message || result.error || 'Unable to process the application.');
         await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Application Failed',
            body: result.message || result.error || 'Unable to process the application.',
          },
          trigger: null,
        });
        return;
      }

      // Save to active jobs so they can resume it from the home screen
      if (result.thread_id) {
        await saveActiveJob({
          thread_id: result.thread_id,
          url: result.url || jobUrl,
          title: result.title || 'Job Application',
          status: 'Needs Review',
          timestamp: Date.now(),
          data: JSON.stringify(result)
        });
      }

      const answers = result.agent_response?.answers || [];
      const needsInput = answers.filter((a: any) => a.needs_user_input);

      if (needsInput.length > 0) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Action Needed',
            body: 'A few fields require your manual input or review.',
            data: { route: '/review', params: { data: JSON.stringify(result) } },
          },
          trigger: null,
        });
      } else {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Ready for Submission',
            body: 'Your application has been auto-filled. Tap to review and submit.',
            data: { route: '/review', params: { data: JSON.stringify(result) } },
          },
          trigger: null,
        });
      }
    }).catch(async (error: any) => {
      setLoading(false);
      const msg = error.friendlyMessage || error.message || 'Failed to connect to the auto-fill service.';
      Alert.alert('Connection Error', msg);
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Connection Error',
          body: msg,
        },
        trigger: null,
      });
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 60) }]} 
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInUp.duration(600).springify()}>
          <View style={styles.headerSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Image 
                source={require('../../assets/icon.png')} 
                style={{ width: 44, height: 44, borderRadius: 12, marginRight: 12 }} 
              />
              <View style={styles.badgeContainer}>
                <View style={styles.pulseDot} />
                <Text style={styles.badgeText}>Agent Active</Text>
              </View>
            </View>
            <Text style={styles.title}>ApplyFaster</Text>
            <Text style={styles.subtitle}>Let AI handle the repetitive forms.</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(600).delay(100).springify()}>
          <View style={[styles.card, isUrlFocused && styles.cardFocused]}>
            <Text style={styles.sectionLabel}>Job URL</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.inputField, isUrlFocused && styles.inputFieldActive]}
                value={url}
                onChangeText={setUrl}
                placeholder="https://company.com/careers/..."
                placeholderTextColor="#666666"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                onFocus={() => setIsUrlFocused(true)}
                onBlur={() => setIsUrlFocused(false)}
              />
              <TouchableOpacity style={styles.iconButton} onPress={handlePaste} activeOpacity={0.7}>
                <Feather name="clipboard" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {activeJobs.length > 0 && (
          <Animated.View entering={StretchInY.duration(500)}>
            <View style={styles.activeJobsContainer}>
              <Text style={styles.sectionLabel}>Active Applications</Text>
              {activeJobs.map((job, index) => (
                <TouchableOpacity 
                  key={job.thread_id} 
                  style={styles.activeJobCard}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (job.data) {
                      router.push({
                        pathname: '/review',
                        params: { data: job.data }
                      });
                    }
                  }}
                >
                  <View style={styles.activeJobInfo}>
                    <Text style={styles.activeJobTitle} numberOfLines={1}>{job.title}</Text>
                    <Text style={styles.activeJobUrl} numberOfLines={1}>{job.url}</Text>
                  </View>
                  <View style={styles.activeJobRight}>
                    <View style={styles.statusBadge}>
                      <Text style={styles.statusText}>{job.status}</Text>
                    </View>
                    <TouchableOpacity onPress={() => removeActiveJob(job.thread_id)} style={styles.deleteButton}>
                      <Feather name="x" size={16} color="#8E8E93" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.duration(600).delay(200).springify()}>
          <View style={styles.bottomSection}>
            <TouchableOpacity 
              style={[styles.primaryButton, (!url.trim() || loading) && styles.primaryButtonDisabled]} 
              onPress={handleApply}
              disabled={!url.trim() || loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <ActivityIndicator color="#FFFFFF" size="small" />
                  <Text style={styles.primaryButtonText}>Initializing Agent...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Apply with AI</Text>
              )}
            </TouchableOpacity>
            <Text style={styles.footerNote}>Safe, secure, and fully automated.</Text>
          </View>
        </Animated.View>

        <View style={{ height: Math.max(insets.bottom, 100) }} />
      </ScrollView>
    </KeyboardAvoidingView>
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
  headerSection: {
    marginBottom: 32,
    marginTop: 20,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 199, 89, 0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  badgeText: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 8,
    fontWeight: '400',
  },
  card: {
    backgroundColor: '#111111',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#222222',
  },
  cardFocused: {
    borderColor: '#007AFF',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputField: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    color: '#FFFFFF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  inputFieldActive: {
    borderColor: '#007AFF',
    backgroundColor: '#1C1C1E',
  },
  iconButton: {
    width: 54,
    height: 54,
    backgroundColor: '#2C2C2E',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomSection: {
    marginTop: 16,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    width: '100%',
    height: 56,
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
  footerNote: {
    marginTop: 16,
    color: '#666666',
    fontSize: 12,
  },
  activeJobsContainer: {
    marginBottom: 16,
  },
  activeJobCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  activeJobInfo: {
    flex: 1,
    marginRight: 12,
  },
  activeJobTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  activeJobUrl: {
    color: '#8E8E93',
    fontSize: 13,
  },
  activeJobRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    backgroundColor: 'rgba(0, 122, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: '#007AFF',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 4,
  },
});
