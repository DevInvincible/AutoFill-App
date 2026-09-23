import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '../src/theme/colors';
import GradientButton from '../src/components/GradientButton';
import { loginToSite, cancelLogin } from '../src/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const { url } = useLocalSearchParams<{ url: string }>();
  
  const [status, setStatus] = useState<'waiting' | 'success' | 'error'>('waiting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    
    const triggerLogin = async () => {
      try {
        const result = await loginToSite(url || 'https://linkedin.com/login');
        if (isMounted) {
          if (result.success) {
            setStatus('success');
            setMessage('Successfully saved your session!');

            // Save connection state
            import('@react-native-async-storage/async-storage').then(({ default: AsyncStorage }) => {
              AsyncStorage.getItem('@connected_accounts').then((data) => {
                const accounts = data ? JSON.parse(data) : {};
                if (url.includes('linkedin')) accounts.linkedin = true;
                if (url.includes('indeed')) accounts.indeed = true;
                if (url.includes('google')) accounts.google = true;
                AsyncStorage.setItem('@connected_accounts', JSON.stringify(accounts));
              });
            });

            // Auto go back after 1.5 seconds
            setTimeout(() => {
              if (isMounted) router.back();
            }, 1500);
          } else {
            setStatus('error');
            setMessage(result.error || result.message || 'Login failed.');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setStatus('error');
          setMessage(err.message || 'Could not connect to the backend.');
        }
      }
    };

    triggerLogin();
    
    return () => {
      isMounted = false;
      // If we unmount before success, cancel the login page on the backend
      cancelLogin().catch(() => {});
    };
  }, [url]);

  const handleCancel = async () => {
    setStatus('waiting');
    await cancelLogin().catch(() => {});
    router.back();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🔐 Connect Account</Text>
        <Text style={styles.subtitle}>
          Securely log in to save your session
        </Text>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {status === 'waiting' ? (
          <View style={styles.waitingBox}>
            <ActivityIndicator size="large" color={Colors.accent} style={{ marginBottom: 20 }} />
            <Text style={styles.instructionTitle}>Check your computer!</Text>
            <Text style={styles.instructionText}>
              A browser window just opened on your PC.
            </Text>
            <Text style={styles.instructionText}>
              Please log in there and close the window when you're done. We are waiting...
            </Text>
          </View>
        ) : status === 'success' ? (
          <View style={[styles.waitingBox, { borderColor: Colors.success }]}>
            <Text style={[styles.instructionTitle, { color: Colors.success, fontSize: 40, marginBottom: 10 }]}>✅</Text>
            <Text style={styles.instructionTitle}>Connected!</Text>
            <Text style={styles.instructionText}>
              Your session is saved. Taking you back...
            </Text>
          </View>
        ) : (
          <View style={[styles.waitingBox, { borderColor: Colors.error }]}>
            <Text style={[styles.instructionTitle, { color: Colors.error, fontSize: 40, marginBottom: 10 }]}>❌</Text>
            <Text style={styles.instructionTitle}>Connection Failed</Text>
            <Text style={[styles.instructionText, { color: Colors.error }]}>
              {message}
            </Text>
          </View>
        )}
      </View>

      {/* Done Button */}
      <View style={styles.footer}>
        <GradientButton
          title={status === 'waiting' ? "Cancel" : "Go Back"}
          onPress={status === 'waiting' ? handleCancel : () => router.back()}
          variant="outline"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  waitingBox: {
    backgroundColor: Colors.bgCard,
    padding: 30,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: 'center',
  },
  instructionText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 10,
  },
  footer: {
    padding: 20,
  },
});
