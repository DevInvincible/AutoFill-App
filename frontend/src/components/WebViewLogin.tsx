import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import CookieManager from '@preeternal/react-native-cookie-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WebViewLoginProps {
  url: string;
  onSuccess: (cookies: any[]) => void;
  onCancel: () => void;
}

export default function WebViewLogin({ url, onSuccess, onCancel }: WebViewLoginProps) {
  const [loading, setLoading] = useState(true);
  const webviewRef = useRef<WebView>(null);

  const userAgent = Platform.OS === 'android'
    ? 'Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36'
    : 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1';

  // Fallback to hide loading spinner if site gets stuck
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  const checkLoginSuccess = async (currentUrl: string) => {
    try {
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;

      // Pass true as second argument to use WKHTTPCookieStore on iOS for modern WebViews
      const cookies = await CookieManager.get(baseUrl, true);

      if (Object.keys(cookies).length > 0) {
        // Find if we have any high-value auth cookies (common names)
        // or if we just have a lot of cookies (usually means logged in)
        const hasAuthCookie = Object.keys(cookies).some(name =>
          name.includes('session') || name === 'li_at' || name.includes('auth') || name.includes('token')
        );

        // If we have an auth cookie OR more than 5 cookies (which usually means a full session), we succeed
        if (hasAuthCookie || Object.keys(cookies).length > 5) {
          const playwrightCookies = Object.keys(cookies).map(key => ({
            name: cookies[key].name,
            value: cookies[key].value,
            url: baseUrl,
            secure: cookies[key].secure ?? true,
            httpOnly: cookies[key].httpOnly ?? false,
          }));

          const existingData = await AsyncStorage.getItem('universal_cookies');
          const allCookies = existingData ? JSON.parse(existingData) : {};

          const domainKey = urlObj.hostname.replace('www.', '');
          allCookies[domainKey] = playwrightCookies;

          await AsyncStorage.setItem('universal_cookies', JSON.stringify(allCookies));
          onSuccess(playwrightCookies);
          return true;
        }
      }
    } catch (e) {
      console.log('Error checking cookies automatically', e);
    }
    return false;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Secure Login</Text>
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color="#6B46C1" />
        </View>
      )}

      <WebView
        ref={webviewRef}
        source={{ uri: url }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(navState) => {
          const currentUrl = navState.url.toLowerCase();
          const isLoginPage = currentUrl.includes('login') ||
            currentUrl.includes('signup') ||
            currentUrl.includes('auth') ||
            currentUrl.includes('checkpoint') ||
            currentUrl.includes('challenge');

          // If we are navigating away from a login page to a non-login page, we probably succeeded!
          if (!isLoginPage && !loading) {
            // Check immediately, and check again in 2 seconds to ensure cookies are fully set
            checkLoginSuccess(currentUrl).then(success => {
              if (!success) setTimeout(() => checkLoginSuccess(currentUrl), 2000);
            });
          }
        }}
        incognito={false}
        sharedCookiesEnabled={true}
        userAgent={userAgent}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1117',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2D3748',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelBtn: {
    padding: 8,
  },
  cancelText: {
    color: '#E53E3E',
    fontSize: 16,
  },
  webview: {
    flex: 1,
  },
  loader: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 17, 23, 0.8)',
    zIndex: 10,
  }
});
