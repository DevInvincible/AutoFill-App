import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import WebViewLogin from '../src/components/WebViewLogin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../src/theme/colors';

export default function LoginScreen() {
  const router = useRouter();
  const { url, resumeUrl } = useLocalSearchParams<{ url: string, resumeUrl?: string }>();
  // Default to LinkedIn if no URL provided
  const targetUrl = url || 'https://www.linkedin.com/login';

  const handleSuccess = async (cookies: any[]) => {
    try {
      // Save connection state for UI
      const data = await AsyncStorage.getItem('@connected_accounts');
      const accounts = data ? JSON.parse(data) : {};
      
      if (targetUrl.includes('linkedin')) accounts.linkedin = true;
      if (targetUrl.includes('indeed')) accounts.indeed = true;
      if (targetUrl.includes('google')) accounts.google = true;
      
      await AsyncStorage.setItem('@connected_accounts', JSON.stringify(accounts));
    } catch (e) {
      console.log('Failed to save connected accounts state', e);
    }

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
