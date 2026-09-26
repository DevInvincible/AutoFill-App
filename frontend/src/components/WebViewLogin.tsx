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
        const hasAuthCookie = Object.keys(cookies).some(name => {
          const lowerName = name.toLowerCase();
          return lowerName.includes('session') || 
                 lowerName === 'li_at' || 
                 lowerName.includes('auth') || 
                 lowerName.includes('token') ||
                 lowerName.includes('sid') ||
                 lowerName.includes('ssid');
        });

        // If we have an auth cookie OR more than 5 cookies (which usually means a full session), we succeed
        if (hasAuthCookie || Object.keys(cookies).length > 5) {
          const baseDomainForCookie = urlObj.hostname.split('.').slice(-2).join('.');
          const playwrightCookies = Object.keys(cookies).map(key => ({
            name: cookies[key].name || key,
            value: cookies[key].value,
            domain: '.' + baseDomainForCookie,  // dot prefix = include all subdomains
            path: cookies[key].path || '/',
            secure: cookies[key].secure ?? true,
            httpOnly: cookies[key].httpOnly ?? false,
          }));

          const existingData = await AsyncStorage.getItem('universal_cookies');
          const allCookies = existingData ? JSON.parse(existingData) : {};

          // Save under the base domain (e.g. "indeed.com") so index.tsx lookup always matches
          const domainKey = urlObj.hostname.split('.').slice(-2).join('.');
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

          // Navigating away from login page — give cookies 1.5s to settle then check
          if (!isLoginPage) {
            setTimeout(() => {
              checkLoginSuccess(currentUrl).then(success => {
                if (!success) setTimeout(() => checkLoginSuccess(currentUrl), 2500);
              });
            }, 1500);
          }
        }}
        sharedCookiesEnabled={true}
        thirdPartyCookiesEnabled={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        userAgent={Platform.OS === 'android' 
          ? "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36"
          : "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
        }
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
