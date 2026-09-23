import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeInUp, StretchInY } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { UserProfile } from '../../src/services/api';

const PROFILE_KEY = '@user_profile';

const defaultProfile: UserProfile = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  location: '',
  country: '',
  university: '',
  current_employer: '',
  current_job_title: '',
  linkedin: '',
  gender: '',
  experience: '',
  resume: '',
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then((data) => {
      if (data) {
        try {
          setProfile(JSON.parse(data));
        } catch {}
      }
    });
  }, []);

  const updateProfile = (key: keyof UserProfile, value: string) => {
    const updated = { ...profile, [key]: value };
    setProfile(updated);
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
  };

  const fields = [
    { key: 'first_name', label: 'First Name' },
    { key: 'last_name', label: 'Last Name' },
    { key: 'email', label: 'Email Address' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'location', label: 'City / Location' },
    { key: 'country', label: 'Country' },
    { key: 'current_job_title', label: 'Current Role' },
    { key: 'current_employer', label: 'Current Company' },
    { key: 'linkedin', label: 'LinkedIn URL' },
    { key: 'experience', label: 'Years of Experience' },
    { key: 'resume', label: 'Resume File Path' },
  ];

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 40) }]} 
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInUp.duration(600).springify()}>
          <View style={styles.headerSection}>
            <Text style={styles.title}>Your Profile</Text>
            <Text style={styles.subtitle}>This data is saved locally on your device and used automatically.</Text>
          </View>
        </Animated.View>

        <Animated.View entering={StretchInY.duration(500).delay(100)} style={styles.formContainer}>
          {fields.map((field) => (
            <View key={field.key} style={styles.fieldGroup}>
              <Text style={[
                styles.fieldLabel, 
                focusedField === field.key && { color: '#007AFF' }
              ]}>
                {field.label}
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  focusedField === field.key && styles.inputFieldActive
                ]}
                value={(profile[field.key as keyof UserProfile] as string) || ''}
                onChangeText={(v) => updateProfile(field.key as keyof UserProfile, v)}
                placeholder={`Enter ${field.label.toLowerCase()}`}
                placeholderTextColor="#5C5C60"
                onFocus={() => setFocusedField(field.key)}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          ))}
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
  title: {
    fontSize: 34,
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
  formContainer: {
    backgroundColor: '#111111',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222222',
  },
  fieldGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 8,
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    height: 50,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  inputFieldActive: {
    borderColor: '#007AFF',
    backgroundColor: '#1C1C1E',
  },
});
