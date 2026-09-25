import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
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

  const performSave = async () => {
    try {
      const urlObj = new URL(url);
      const baseUrl = `${urlObj.protocol}//${urlObj.hostname}`;
      
      const cookies = await CookieManager.get(baseUrl);
      
      if (Object.keys(cookies).length > 0) {
        const playwrightCookies = Object.keys(cookies).map(key => ({
          name: cookies[key].name,
          value: cookies[key].value,
          domain: cookies[key].domain || `.${urlObj.hostname.replace('www.', '')}`,
          path: cookies[key].path || '/',
          secure: cookies[key].secure ?? true,
          httpOnly: cookies[key].httpOnly ?? false,
        }));
        
        const existingData = await AsyncStorage.getItem('universal_cookies');
        const allCookies = existingData ? JSON.parse(existingData) : {};
        
        // Normalize domain by removing www.
        const domainKey = urlObj.hostname.replace('www.', '');
        allCookies[domainKey] = playwrightCookies;
        
        await AsyncStorage.setItem('universal_cookies', JSON.stringify(allCookies));
        
        onSuccess(playwrightCookies);
      } else {
        Alert.alert("No Cookies Found", "We couldn't detect any login session. Please try logging in again.");
      }
    } catch (e) {
      console.log('Error checking cookies', e);
      onCancel();
    }
  };

  const handleSaveLogin = () => {
    Alert.alert(
      "Confirm Login",
      "Have you successfully logged into your account and can see your dashboard?",
      [
        { text: "No, let me finish", style: "cancel" },
        { text: "Yes, I'm logged in", onPress: performSave }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Secure Login</Text>
        <TouchableOpacity onPress={handleSaveLogin} style={styles.saveBtn}>
          <Text style={styles.saveText}>Save Login</Text>
        </TouchableOpacity>
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
        incognito={true}
        sharedCookiesEnabled={true}
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
  saveBtn: {
    padding: 8,
    marginRight: 10,
    backgroundColor: '#6B46C1',
    borderRadius: 8,
  },
  saveText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
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
