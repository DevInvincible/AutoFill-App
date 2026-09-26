import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import WebViewLogin from '../src/components/WebViewLogin';
import { Colors } from '../src/theme/colors';

export default function LoginScreen() {
  const router = useRouter();
  const { url, resumeUrl } = useLocalSearchParams<{ url: string, resumeUrl?: string }>();
  // Default to LinkedIn if no URL provided
  const targetUrl = url || 'https://www.linkedin.com/login';

  const handleSuccess = async (_cookies: any[]) => {
    // Cookies are already saved inside WebViewLogin into 'universal_cookies'.
    // The Accounts screen reads directly from there - no separate flag needed.
    if (resumeUrl) {
      router.replace({ pathname: '/', params: { resumeUrl } });
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <WebViewLogin 
        url={targetUrl}
        onSuccess={handleSuccess}
        onCancel={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
});
