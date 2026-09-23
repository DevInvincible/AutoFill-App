import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

export default function AccountsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [connected, setConnected] = useState<{ linkedin?: boolean, indeed?: boolean, google?: boolean }>({});

  useFocusEffect(
    React.useCallback(() => {
      AsyncStorage.getItem('@connected_accounts').then((data) => {
        if (data) {
          try {
            setConnected(JSON.parse(data));
          } catch {}
        }
      });
    }, [])
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 40) }]}
      >
        <Animated.View entering={FadeInUp.duration(600).springify()}>
          <View style={styles.headerSection}>
            <Text style={styles.title}>Linked Accounts</Text>
            <Text style={styles.subtitle}>Connect your platforms to apply faster and skip login walls.</Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInUp.duration(600).delay(100).springify()}>
          <View style={styles.providersContainer}>
            
            <TouchableOpacity 
              style={styles.providerBtn} 
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/login', params: { url: 'https://www.linkedin.com/login' }})}
            >
              <View style={styles.providerIconContainer}>
                <FontAwesome5 name="linkedin" size={24} color="#0A66C2" />
              </View>
              <View style={styles.providerTextContainer}>
                <Text style={styles.providerTitle}>LinkedIn</Text>
                {connected.linkedin ? (
                  <Text style={styles.connectedText}>Connected</Text>
                ) : (
                  <Text style={styles.providerSubtitle}>Login to bypass walls</Text>
                )}
              </View>
              {connected.linkedin ? (
                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#666666" />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.providerBtn} 
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/login', params: { url: 'https://secure.indeed.com/auth' }})}
            >
              <View style={styles.providerIconContainer}>
                <Text style={[styles.providerTitle, { color: '#2164f3', fontSize: 18 }]}>Indeed</Text>
              </View>
              <View style={styles.providerTextContainer}>
                <Text style={styles.providerTitle}>Indeed</Text>
                {connected.indeed ? (
                  <Text style={styles.connectedText}>Connected</Text>
                ) : (
                  <Text style={styles.providerSubtitle}>Login to apply directly</Text>
                )}
              </View>
              {connected.indeed ? (
                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#666666" />
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.providerBtn} 
              activeOpacity={0.7}
              onPress={() => router.push({ pathname: '/login', params: { url: 'https://accounts.google.com/signin' }})}
            >
              <View style={styles.providerIconContainer}>
                <FontAwesome5 name="google" size={20} color="#EA4335" />
              </View>
              <View style={styles.providerTextContainer}>
                <Text style={styles.providerTitle}>Google</Text>
                {connected.google ? (
                  <Text style={styles.connectedText}>Connected</Text>
                ) : (
                  <Text style={styles.providerSubtitle}>Sign in with Google</Text>
                )}
              </View>
              {connected.google ? (
                <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#666666" />
              )}
            </TouchableOpacity>

          </View>
        </Animated.View>

        <View style={{ height: Math.max(insets.bottom, 100) }} />
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
  providersContainer: {
    gap: 16,
  },
  providerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222222',
  },
  providerIconContainer: {
    width: 48,
    height: 48,
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  providerTextContainer: {
    flex: 1,
  },
  providerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  providerSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
  },
  connectedText: {
    fontSize: 13,
    color: '#34C759',
    fontWeight: '500',
  }
});
